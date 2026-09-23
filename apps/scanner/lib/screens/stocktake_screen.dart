import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/client.dart';
import '../api/generated/export.dart';
import '../l10n/generated/app_localizations.dart';
import '../l10n/labels.dart';
import '../product_label.dart';
import '../scan/camera_scan_screen.dart';
import '../state/providers.dart';
import '../theme.dart';

/// Ask where the counter is. A stocktake over one location needs no asking; a
/// wider one offers its `countingLocations`, with the last pick for this
/// stocktake first in line.
Future<StocktakeLocation?> pickCountingLocation(
  BuildContext context,
  WidgetRef ref,
  StocktakeSummary stocktake,
) async {
  final locations = stocktake.countingLocations;
  if (locations.isEmpty) return null;
  final remembered = ref.read(stocktakeLocationProvider)[stocktake.id];
  final picked = locations.length == 1
      ? locations.single
      : await _locationSheet(context, locations, remembered);
  if (picked != null) {
    ref.read(stocktakeLocationProvider.notifier).remember(stocktake.id, picked.id);
  }
  return picked;
}

Future<StocktakeLocation?> _locationSheet(
  BuildContext context,
  List<StocktakeLocation> locations,
  String? current,
) {
  final l10n = S.of(context);
  return showModalBottomSheet<StocktakeLocation>(
    context: context,
    showDragHandle: true,
    isScrollControlled: true,
    builder: (sheetContext) => SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.of(sheetContext).size.height * 0.7,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: Text(
                l10n.stocktakeWhereAreYou,
                style: Theme.of(sheetContext).textTheme.titleMedium,
              ),
            ),
            Flexible(
              child: ListView(
                shrinkWrap: true,
                children: [
                  for (final location in locations)
                    ListTile(
                      leading: Icon(
                        location.id == current
                            ? Icons.radio_button_checked
                            : Icons.radio_button_unchecked,
                      ),
                      title: Text(location.name),
                      onTap: () => Navigator.of(sheetContext).pop(location),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

enum _Kind { found, unexpected, already, info, error }

class _Entry {
  _Entry({
    required this.code,
    required this.kind,
    required this.title,
    required this.detail,
    this.assetId,
  }) : at = DateTime.now();

  final String code;
  final _Kind kind;
  final String title;
  final String detail;

  /// Set when this entry is a tick of the caller's own, which they may take
  /// back or annotate. Cleared once it has been taken back.
  String? assetId;
  final DateTime at;

  bool get ok => kind != _Kind.error;

  CameraScanFeedback get feedback => CameraScanFeedback(
    ok: ok,
    title: title,
    detail: code.isEmpty ? detail : '$code · $detail',
  );
}

/// Counting into a stocktake. Every scan is sent as it arrives and answered
/// with found / not on the list / already counted; the second tab is what is
/// still to be found here, including the loose products that are counted
/// rather than scanned.
class StocktakeScreen extends ConsumerStatefulWidget {
  const StocktakeScreen({super.key, required this.stocktakeId, required this.location});

  final String stocktakeId;
  final StocktakeLocation location;

  @override
  ConsumerState<StocktakeScreen> createState() => _StocktakeScreenState();
}

class _StocktakeScreenState extends ConsumerState<StocktakeScreen> {
  final _entries = <_Entry>[];
  final _manualController = TextEditingController();
  final _feedback = StreamController<CameraScanFeedback>.broadcast();
  StreamSubscription<String>? _sub;
  late StocktakeLocation _location = widget.location;

  /// One scan after another, never dropped — see SessionScreen._queue. A
  /// confirm sheet holds the queue, so scans made meanwhile wait their turn.
  Future<void> _queue = Future<void>.value();
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _sub = ref.read(scanBusProvider).codes.listen(_enqueue);
  }

  @override
  void dispose() {
    _sub?.cancel();
    _manualController.dispose();
    _feedback.close();
    super.dispose();
  }

  void _refresh() => ref.invalidate(stocktakeProvider(widget.stocktakeId));

  void _enqueue(String code) {
    if (code.trim().isEmpty) return;
    _queue = _queue.then((_) => _submit(code.trim()));
  }

  Future<void> _submit(String code) async {
    final api = ref.read(apiClientProvider);
    if (api == null || !mounted) return;
    // Read before the await — see SessionScreen._submit.
    final l10n = S.of(context);

    setState(() => _busy = true);
    try {
      final result = await api.stocktake.scanIntoStocktake(
        stocktakeId: widget.stocktakeId,
        body: StocktakeScanRequest(code: code, locationId: _location.id),
      );
      final item = result.item;
      switch (result.outcome) {
        case StocktakeScanResultOutcome.found:
          _push(
            _Entry(
              code: code,
              kind: _Kind.found,
              title: _itemLabel(item),
              detail: [
                l10n.stocktakeFound,
                if (result.wasOutAt != null) l10n.stocktakeWasOut(result.wasOutAt!),
              ].join(' · '),
              assetId: item?.assetId,
            ),
          );
          unawaited(SystemSound.play(SystemSoundType.click));
          unawaited(HapticFeedback.lightImpact());
        case StocktakeScanResultOutcome.unexpected:
          _push(
            _Entry(
              code: code,
              kind: _Kind.unexpected,
              title: _itemLabel(item),
              detail:
                  '${l10n.stocktakeUnexpected} · '
                  '${Labels.unexpectedReason(l10n, item?.unexpectedReason)}',
              assetId: item?.assetId,
            ),
          );
          unawaited(HapticFeedback.mediumImpact());
        case StocktakeScanResultOutcome.already:
          _push(
            _Entry(
              code: code,
              kind: _Kind.already,
              title: _itemLabel(item),
              detail: l10n.stocktakeAlready(result.alreadyFoundByName ?? '—'),
            ),
          );
          unawaited(HapticFeedback.lightImpact());
        case StocktakeScanResultOutcome.bundle:
          _push(
            _Entry(
              code: code,
              kind: _Kind.info,
              title: l10n.stocktakeBundle(result.bundle?.name ?? code),
              detail: l10n.stocktakeConfirmBundle,
            ),
          );
          unawaited(SystemSound.play(SystemSoundType.click));
        case StocktakeScanResultOutcome.$unknown:
          break;
      }

      final confirmable = result.outcome != StocktakeScanResultOutcome.already;
      if (confirmable && result.confirm.any((e) => e.foundByName == null)) {
        await _confirm(
          result.confirm,
          bundle: result.outcome == StocktakeScanResultOutcome.bundle,
        );
      }
    } catch (error) {
      _push(
        _Entry(
          code: code,
          kind: _Kind.error,
          title: code,
          detail: describeError(l10n, error),
        ),
      );
      unawaited(HapticFeedback.heavyImpact());
    } finally {
      if (mounted) setState(() => _busy = false);
      _refresh();
    }
  }

  static String _itemLabel(StocktakeItem? item) =>
      item == null ? '—' : productLabel(item.manufacturerName, item.productName);

  /// The accessories that came with a scanned unit, or a bundle's members,
  /// pre-checked: the operator unchecks what is missing.
  Future<void> _confirm(List<StocktakeConfirmEntry> entries, {required bool bundle}) async {
    // Runs after the scan's round trip, so the screen may be gone by now.
    if (!mounted) return;
    final l10n = S.of(context);
    final picked = await showModalBottomSheet<Set<String>>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      isDismissible: false,
      builder: (_) => _ConfirmSheet(
        title: bundle ? l10n.stocktakeConfirmBundle : l10n.stocktakeConfirmAccessories,
        entries: entries,
      ),
    );
    if (picked == null || picked.isEmpty || !mounted) return;
    await _tick(
      picked.toList(),
      bundle ? StocktakeTickRequestVia.bundle : StocktakeTickRequestVia.parent,
      titles: {
        for (final e in entries) e.assetId: productLabel(e.manufacturerName, e.productName),
      },
      codes: {for (final e in entries) e.assetId: e.assetTag ?? ''},
    );
  }

  Future<void> _tick(
    List<String> assetIds,
    StocktakeTickRequestVia via, {
    required Map<String, String> titles,
    required Map<String, String> codes,
  }) async {
    final api = ref.read(apiClientProvider);
    if (api == null) return;
    final l10n = S.of(context);
    try {
      await api.stocktake.tickStocktakeItems(
        stocktakeId: widget.stocktakeId,
        body: StocktakeTickRequest(assetIds: assetIds, locationId: _location.id, via: via),
      );
      for (final id in assetIds) {
        _push(
          _Entry(
            code: codes[id] ?? '',
            kind: _Kind.found,
            title: titles[id] ?? id,
            detail: via == StocktakeTickRequestVia.manual
                ? l10n.stocktakeManualTicked
                : l10n.stocktakeConfirmed(1),
            assetId: id,
          ),
          echo: false,
        );
      }
      unawaited(HapticFeedback.lightImpact());
    } catch (error) {
      _push(
        _Entry(
          code: '',
          kind: _Kind.error,
          title: l10n.stocktake,
          detail: describeError(l10n, error),
        ),
      );
    } finally {
      _refresh();
    }
  }

  void _push(_Entry entry, {bool echo = true}) {
    if (echo && !_feedback.isClosed) _feedback.add(entry.feedback);
    if (!mounted) return;
    setState(() => _entries.insert(0, entry));
  }

  void _submitManual() {
    // Not through the scan bus, as in SessionScreen: a retyped tag is meant.
    final code = _manualController.text.trim();
    if (code.isNotEmpty) _queue = _queue.then((_) => _submit(code));
    _manualController.clear();
  }

  Future<void> _openCamera() => Navigator.of(context).push<void>(
    MaterialPageRoute(
      builder: (_) => CameraScanScreen(
        title: _location.name,
        continuous: true,
        feedback: _feedback.stream,
      ),
    ),
  );

  Future<void> _changeLocation(StocktakeDetail detail) async {
    final picked = await _locationSheet(context, detail.countingLocations, _location.id);
    if (picked == null || !mounted) return;
    ref.read(stocktakeLocationProvider.notifier).remember(widget.stocktakeId, picked.id);
    setState(() => _location = picked);
  }

  Future<void> _close(StocktakeDetail detail) async {
    final l10n = S.of(context);
    final api = ref.read(apiClientProvider);
    if (api == null) return;
    final open = detail.progress.expected - detail.progress.found;
    final ok = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(l10n.stocktakeClose),
        content: Text(l10n.stocktakeCloseConfirm(open)),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: Text(l10n.cancel),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: Text(l10n.stocktakeClose),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    final messenger = ScaffoldMessenger.of(context);
    try {
      await api.stocktake.closeStocktake(stocktakeId: widget.stocktakeId);
      ref.invalidate(openStocktakesProvider);
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        builder: (dialogContext) => AlertDialog(
          content: Text(l10n.stocktakeClosed),
          actions: [
            FilledButton(
              onPressed: () => Navigator.of(dialogContext).pop(),
              child: Text(l10n.continueLabel),
            ),
          ],
        ),
      );
      if (mounted) Navigator.of(context).pop();
    } catch (error) {
      messenger.showSnackBar(SnackBar(content: Text(describeError(l10n, error))));
    }
  }

  /// Long-press on an own tick: take it back, or note its condition.
  Future<void> _entryActions(_Entry entry, StocktakeDetail? detail) async {
    final assetId = entry.assetId;
    if (assetId == null) return;
    final l10n = S.of(context);
    final action = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              title: Text(entry.title, style: const TextStyle(fontWeight: FontWeight.w600)),
            ),
            ListTile(
              leading: const Icon(Icons.edit_note),
              title: Text(l10n.stocktakeEditNote),
              onTap: () => Navigator.of(sheetContext).pop('note'),
            ),
            ListTile(
              leading: const Icon(Icons.undo),
              title: Text(l10n.stocktakeUndo),
              onTap: () => Navigator.of(sheetContext).pop('undo'),
            ),
          ],
        ),
      ),
    );
    if (!mounted || action == null) return;
    final api = ref.read(apiClientProvider);
    if (api == null) return;
    final messenger = ScaffoldMessenger.of(context);

    try {
      if (action == 'undo') {
        await api.stocktake.untickStocktakeItem(
          stocktakeId: widget.stocktakeId,
          assetId: assetId,
        );
        if (!mounted) return;
        setState(() => entry.assetId = null);
        _push(
          _Entry(
            code: entry.code,
            kind: _Kind.info,
            title: entry.title,
            detail: l10n.stocktakeUnticked,
          ),
          echo: false,
        );
      } else {
        StocktakeItem? item;
        for (final i in detail?.items ?? const <StocktakeItem>[]) {
          if (i.assetId == assetId) item = i;
        }
        final result = await showDialog<StocktakeNoteRequest>(
          context: context,
          builder: (_) => _NoteDialog(
            title: entry.title,
            note: item?.note,
            needsAttention: item?.needsAttention ?? false,
          ),
        );
        if (result == null) return;
        await api.stocktake.setStocktakeItemNote(
          stocktakeId: widget.stocktakeId,
          assetId: assetId,
          body: result,
        );
      }
    } catch (error) {
      messenger.showSnackBar(SnackBar(content: Text(describeError(l10n, error))));
    } finally {
      _refresh();
    }
  }

  Future<void> _count(StocktakeProductCount product, int? current) async {
    final l10n = S.of(context);
    final api = ref.read(apiClientProvider);
    if (api == null) return;
    final messenger = ScaffoldMessenger.of(context);
    final count = await showDialog<int>(
      context: context,
      builder: (_) => _CountDialog(
        title: productLabel(product.manufacturerName, product.productName),
        initial: current,
      ),
    );
    if (count == null) return;
    try {
      await api.stocktake.setStocktakeCount(
        stocktakeId: widget.stocktakeId,
        body: StocktakeCountRequest(
          productId: product.productId,
          locationId: _location.id,
          count: count,
        ),
      );
    } catch (error) {
      messenger.showSnackBar(SnackBar(content: Text(describeError(l10n, error))));
    } finally {
      _refresh();
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = S.of(context);
    final scheme = Theme.of(context).colorScheme;
    final camera = ref.watch(scanSettingsProvider).cameraEnabled;
    final async = ref.watch(stocktakeProvider(widget.stocktakeId));
    final detail = async.value;
    final progress = detail?.progress;

    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(detail?.name ?? l10n.stocktake, overflow: TextOverflow.ellipsis),
              Text(
                _location.name,
                style: Theme.of(context).textTheme.bodySmall,
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ),
          actions: [
            if (camera)
              IconButton(
                tooltip: l10n.scanWithCamera,
                onPressed: _openCamera,
                icon: const Icon(Icons.photo_camera_outlined),
              ),
            if (detail != null)
              PopupMenuButton<String>(
                onSelected: (v) => v == 'close' ? _close(detail) : _changeLocation(detail),
                itemBuilder: (_) => [
                  if (detail.countingLocations.length > 1)
                    PopupMenuItem(
                      value: 'location',
                      child: Text(l10n.stocktakeChangeLocation),
                    ),
                  PopupMenuItem(value: 'close', child: Text(l10n.stocktakeClose)),
                ],
              ),
          ],
          bottom: PreferredSize(
            preferredSize: const Size.fromHeight(86),
            child: Column(
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 6),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        progress == null
                            ? '…'
                            : [
                                l10n.stocktakeProgress(progress.found, progress.expected),
                                if (progress.out > 0) l10n.stocktakeOutCount(progress.out),
                                if (progress.unexpected > 0)
                                  l10n.stocktakeUnexpectedCount(progress.unexpected),
                              ].join(' · '),
                      ),
                      const SizedBox(height: 4),
                      LinearProgressIndicator(
                        value: progress == null
                            ? null
                            : progress.expected == 0
                            ? 1
                            : progress.found / progress.expected,
                      ),
                    ],
                  ),
                ),
                TabBar(
                  tabs: [
                    Tab(text: l10n.scansLabel),
                    Tab(text: l10n.stocktakeTabOpen),
                  ],
                ),
              ],
            ),
          ),
        ),
        body: TabBarView(
          children: [
            Column(
              children: [
                if (camera)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(12, 12, 12, 4),
                    child: FilledButton.icon(
                      onPressed: _openCamera,
                      icon: const Icon(Icons.photo_camera_outlined),
                      label: Text(l10n.scanWithCamera),
                    ),
                  )
                else
                  // Inverts while a scan is in flight — see SessionScreen.
                  Container(
                    width: double.infinity,
                    color: _busy ? scheme.inverseSurface : scheme.surfaceContainerHighest,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    child: Center(
                      child: Text(
                        _busy ? '…' : l10n.scanNow,
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                          color: _busy ? scheme.onInverseSurface : scheme.onSurface,
                        ),
                      ),
                    ),
                  ),
                Expanded(
                  child: _entries.isEmpty
                      ? Center(child: Text(l10n.sessionEmpty))
                      : ListView.separated(
                          itemCount: _entries.length,
                          separatorBuilder: (_, _) => const Divider(height: 1),
                          itemBuilder: (_, i) => _EntryTile(
                            entry: _entries[i],
                            onLongPress: () => _entryActions(_entries[i], detail),
                          ),
                        ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
                  child: Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: _manualController,
                          textInputAction: TextInputAction.send,
                          decoration: InputDecoration(
                            labelText: l10n.manualEntry,
                            isDense: true,
                          ),
                          onSubmitted: (_) => _submitManual(),
                        ),
                      ),
                      const SizedBox(width: 8),
                      IconButton.filled(
                        onPressed: _submitManual,
                        icon: const Icon(Icons.send),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            async.hasValue
                ? _OpenHere(
                    detail: detail!,
                    locationId: _location.id,
                    onTick: (item) => _tick(
                      [item.assetId],
                      StocktakeTickRequestVia.manual,
                      titles: {item.assetId: _itemLabel(item)},
                      codes: {item.assetId: item.assetTag ?? ''},
                    ),
                    onCount: _count,
                  )
                : async.hasError
                ? Center(child: Text(describeError(l10n, async.error!)))
                : const Center(child: CircularProgressIndicator()),
          ],
        ),
      ),
    );
  }
}

class _EntryTile extends StatelessWidget {
  const _EntryTile({required this.entry, required this.onLongPress});

  final _Entry entry;
  final VoidCallback onLongPress;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final status = StatusColors.of(context);
    final (icon, color) = switch (entry.kind) {
      _Kind.found => (Icons.check_circle, status.success),
      _Kind.unexpected => (Icons.help, status.warning),
      _Kind.already => (Icons.check_circle_outline, scheme.onSurfaceVariant),
      _Kind.info => (Icons.info_outline, scheme.onSurfaceVariant),
      _Kind.error => (Icons.error, scheme.error),
    };
    return ListTile(
      leading: Icon(icon, color: color, size: 30),
      title: Text(entry.title, style: const TextStyle(fontWeight: FontWeight.w600)),
      subtitle: Text(entry.code.isEmpty ? entry.detail : '${entry.code} · ${entry.detail}'),
      trailing: entry.assetId == null ? null : const Icon(Icons.more_vert),
      onLongPress: entry.assetId == null ? null : onLongPress,
    );
  }
}

class _ConfirmSheet extends StatefulWidget {
  const _ConfirmSheet({required this.title, required this.entries});

  final String title;
  final List<StocktakeConfirmEntry> entries;

  @override
  State<_ConfirmSheet> createState() => _ConfirmSheetState();
}

class _ConfirmSheetState extends State<_ConfirmSheet> {
  late final _checked = {
    for (final e in widget.entries)
      if (e.foundByName == null) e.assetId,
  };

  @override
  Widget build(BuildContext context) {
    final l10n = S.of(context);
    final theme = Theme.of(context);
    return SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.8),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 4),
              child: Text(widget.title, style: theme.textTheme.titleMedium),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: Text(
                l10n.stocktakeConfirmHint,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
            ),
            Flexible(
              child: ListView(
                shrinkWrap: true,
                children: [
                  for (final e in widget.entries)
                    CheckboxListTile(
                      value: e.foundByName != null || _checked.contains(e.assetId),
                      onChanged: e.foundByName != null
                          ? null
                          : (on) => setState(
                              () => on == true
                                  ? _checked.add(e.assetId)
                                  : _checked.remove(e.assetId),
                            ),
                      title: Text(productLabel(e.manufacturerName, e.productName)),
                      subtitle: Text(
                        [
                          ?e.assetTag,
                          if (e.foundByName != null)
                            l10n.stocktakeCountedBy(e.foundByName!),
                        ].join(' · '),
                      ),
                    ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(12),
              child: Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => Navigator.of(context).pop(<String>{}),
                      child: Text(l10n.cancel),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: FilledButton(
                      onPressed: () => Navigator.of(context).pop(_checked),
                      child: Text('${l10n.stocktakeConfirm} (${_checked.length})'),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// What is still to be found at the counter's location: units to tick, and
/// loose products to count.
class _OpenHere extends StatefulWidget {
  const _OpenHere({
    required this.detail,
    required this.locationId,
    required this.onTick,
    required this.onCount,
  });

  final StocktakeDetail detail;
  final String locationId;
  final ValueChanged<StocktakeItem> onTick;
  final void Function(StocktakeProductCount product, int? current) onCount;

  @override
  State<_OpenHere> createState() => _OpenHereState();
}

class _OpenHereState extends State<_OpenHere> {
  String? _categoryId;

  @override
  Widget build(BuildContext context) {
    final l10n = S.of(context);
    final theme = Theme.of(context);

    final open = widget.detail.items
        .where(
          (i) =>
              i.state == StocktakeItemState.open &&
              i.expectedLocation?.id == widget.locationId,
        )
        .toList();
    final products = widget.detail.products;

    final categories = <String, Category>{
      for (final i in open) i.category.id: i.category,
      for (final p in products) p.category.id: p.category,
    }.values.toList()..sort((a, b) => a.sortOrder.compareTo(b.sortOrder));

    bool inFilter(Category c) => _categoryId == null || c.id == _categoryId;
    final shownItems = open.where((i) => inFilter(i.category)).toList()
      ..sort((a, b) => _itemSort(a).compareTo(_itemSort(b)));
    final shownProducts = products.where((p) => inFilter(p.category)).toList();

    StocktakeLocationCount? here(StocktakeProductCount p) {
      for (final l in p.locations) {
        if (l.location.id == widget.locationId) return l;
      }
      return null;
    }

    return ListView(
      children: [
        if (categories.length > 1)
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
            child: Row(
              children: [
                ChoiceChip(
                  label: Text(l10n.all),
                  selected: _categoryId == null,
                  onSelected: (_) => setState(() => _categoryId = null),
                ),
                for (final c in categories) ...[
                  const SizedBox(width: 8),
                  ChoiceChip(
                    label: Text(c.name),
                    selected: _categoryId == c.id,
                    onSelected: (_) => setState(() => _categoryId = c.id),
                  ),
                ],
              ],
            ),
          ),
        if (shownItems.isEmpty)
          Padding(
            padding: const EdgeInsets.all(24),
            child: Center(child: Text(l10n.stocktakeNothingOpenHere)),
          )
        else ...[
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
            child: Text(
              l10n.stocktakeTickHint,
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ),
          for (final item in shownItems)
            ListTile(
              leading: const Icon(Icons.check_box_outline_blank),
              title: Text(productLabel(item.manufacturerName, item.productName)),
              subtitle: Text(
                [?item.assetTag ?? item.serialNumber, ?item.bundleName].join(' · '),
              ),
              onTap: () => widget.onTick(item),
            ),
        ],
        if (shownProducts.isNotEmpty) ...[
          const Divider(height: 24),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 4),
            child: Text(l10n.stocktakeLoose, style: theme.textTheme.titleSmall),
          ),
          for (final p in shownProducts)
            Builder(
              builder: (_) {
                final at = here(p);
                return ListTile(
                  title: Text(productLabel(p.manufacturerName, p.productName)),
                  subtitle: Text(l10n.stocktakeLooseLine(at?.expected ?? 0, p.counted)),
                  trailing: Text(
                    at?.myCount?.toString() ?? '–',
                    style: theme.textTheme.titleLarge,
                  ),
                  onTap: () => widget.onCount(p, at?.myCount),
                );
              },
            ),
        ],
        const SizedBox(height: 24),
      ],
    );
  }

  static String _itemSort(StocktakeItem i) =>
      '${i.category.sortOrder.toString().padLeft(4, '0')} ${i.productName} ${i.assetTag ?? ''}';
}

class _CountDialog extends StatefulWidget {
  const _CountDialog({required this.title, required this.initial});

  final String title;
  final int? initial;

  @override
  State<_CountDialog> createState() => _CountDialogState();
}

class _CountDialogState extends State<_CountDialog> {
  late final _controller = TextEditingController(text: widget.initial?.toString() ?? '');

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _save() {
    final value = int.tryParse(_controller.text.trim());
    if (value == null || value < 0) return;
    Navigator.of(context).pop(value);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = S.of(context);
    return AlertDialog(
      title: Text(widget.title),
      content: TextField(
        controller: _controller,
        autofocus: true,
        keyboardType: TextInputType.number,
        inputFormatters: [FilteringTextInputFormatter.digitsOnly],
        decoration: InputDecoration(labelText: l10n.stocktakeYourCount),
        onSubmitted: (_) => _save(),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: Text(l10n.cancel)),
        FilledButton(onPressed: _save, child: Text(l10n.save)),
      ],
    );
  }
}

class _NoteDialog extends StatefulWidget {
  const _NoteDialog({
    required this.title,
    required this.note,
    required this.needsAttention,
  });

  final String title;
  final String? note;
  final bool needsAttention;

  @override
  State<_NoteDialog> createState() => _NoteDialogState();
}

class _NoteDialogState extends State<_NoteDialog> {
  late final _controller = TextEditingController(text: widget.note ?? '');
  late bool _attention = widget.needsAttention;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = S.of(context);
    return AlertDialog(
      title: Text(widget.title),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          TextField(
            controller: _controller,
            decoration: InputDecoration(labelText: l10n.stocktakeNote),
            maxLines: 3,
            minLines: 1,
          ),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(l10n.stocktakeNeedsAttention),
            value: _attention,
            onChanged: (v) => setState(() => _attention = v),
          ),
        ],
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: Text(l10n.cancel)),
        FilledButton(
          onPressed: () => Navigator.of(context).pop(
            StocktakeNoteRequest(
              note: _controller.text.trim().isEmpty ? null : _controller.text.trim(),
              needsAttention: _attention,
            ),
          ),
          child: Text(l10n.save),
        ),
      ],
    );
  }
}
