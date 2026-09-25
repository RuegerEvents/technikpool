import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/client.dart';
import '../api/generated/export.dart';
import '../cable_format.dart';
import '../l10n/generated/app_localizations.dart';
import '../l10n/labels.dart';
import '../product_label.dart';
import '../scan/camera_scan_screen.dart';
import '../state/providers.dart';
import '../theme.dart';
import '../widgets/category_pill.dart';

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
        constraints: BoxConstraints(maxHeight: MediaQuery.of(sheetContext).size.height * 0.7),
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

  /// Counts entered but not yet read back, by product id, so a row shows the
  /// number just entered while the write and the reload are on their way —
  /// and a second tap on `+` counts from it rather than from the stale one.
  /// Cleared once the reload carries the write; a newer entry keeps it.
  final _pendingCounts = <String, int>{};
  final _countSeq = <String, int>{};

  /// The stored count each pending entry was made from (none yet is 0), sent
  /// as `previous`: if the server holds something else by then — the
  /// same person counting on a second device — the write is refused rather
  /// than overwriting a number this device never showed.
  final _countBase = <String, int>{};

  /// `+` taps are gathered for a moment and sent as one write, so three taps
  /// cost one request.
  final _countTimers = <String, Timer>{};
  static const _bumpDebounce = Duration(milliseconds: 800);

  /// Writes are sent one after another: two writes for a product must arrive
  /// in the order they were made, and HTTP alone does not promise that.
  Future<void> _countQueue = Future<void>.value();

  /// Others count at the same time and nothing tells this device when, so an
  /// open stocktake is reloaded every few seconds while this screen is in
  /// front, and at once when the app comes back to the foreground.
  Timer? _poll;
  late final AppLifecycleListener _lifecycle;
  static const _pollEvery = Duration(seconds: 10);

  @override
  void initState() {
    super.initState();
    _sub = ref.read(scanBusProvider).codes.listen(_enqueue);
    _poll = Timer.periodic(_pollEvery, (_) => _pollNow());
    _lifecycle = AppLifecycleListener(onResume: _pollNow);
  }

  /// The client the last `+` was counted with, kept so taps still waiting
  /// out the debounce can be sent on the way out — `ref` is gone by then.
  ApiClient? _countApi;

  @override
  void dispose() {
    _poll?.cancel();
    _lifecycle.dispose();
    // Leaving right after a few taps must not lose them. Fire and forget: no
    // screen is left to report to, and the next open reads what landed.
    for (final id in _countTimers.keys) {
      final count = _pendingCounts[id];
      if (count == null) continue;
      _countApi?.stocktake
          .setStocktakeCount(
            stocktakeId: widget.stocktakeId,
            body: StocktakeCountRequest(
              productId: id,
              locationId: _location.id,
              count: count,
              previous: _countBase[id] ?? 0,
            ),
          )
          .ignore();
    }
    for (final timer in _countTimers.values) {
      timer.cancel();
    }
    _sub?.cancel();
    _manualController.dispose();
    _feedback.close();
    super.dispose();
  }

  void _pollNow() {
    if (!mounted) return;
    // Not while a sheet or dialog is on top, where a reload would only move
    // things behind it, and not while the app is in the background.
    final inFront = ModalRoute.of(context)?.isCurrent ?? true;
    final resumed =
        WidgetsBinding.instance.lifecycleState == AppLifecycleState.resumed;
    if (inFront && resumed) _refresh();
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
        _Entry(code: code, kind: _Kind.error, title: code, detail: describeError(l10n, error)),
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
      builder: (_) =>
          CameraScanScreen(title: _location.name, continuous: true, feedback: _feedback.stream),
    ),
  );

  Future<void> _changeLocation(StocktakeDetail detail) async {
    _flushCounts();
    final picked = await _locationSheet(context, detail.countingLocations, _location.id);
    if (picked == null || !mounted) return;
    ref.read(stocktakeLocationProvider.notifier).remember(widget.stocktakeId, picked.id);
    setState(() => _location = picked);
  }

  Future<void> _close(StocktakeDetail detail) async {
    _flushCounts();
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
      // The counts flushed above are still in flight; a closed stocktake
      // would refuse them.
      await _countQueue;
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
    final count = await showDialog<int>(
      context: context,
      builder: (_) => _CountDialog(
        title: productLabel(product.manufacturerName, product.productName),
        initial: current,
      ),
    );
    if (count == null || !mounted) return;
    _enterCount(product.productId, count, current);
    _sendCount(product.productId);
  }

  /// One more of a loose product, without the dialog — a shelf of cables is
  /// counted by pressing `+` for each one taken down. Sent once the taps stop.
  void _bump(StocktakeProductCount product, int? current) {
    final id = product.productId;
    _countApi = ref.read(apiClientProvider);
    _enterCount(id, (_pendingCounts[id] ?? current ?? 0) + 1, current);
    _countTimers[id]?.cancel();
    _countTimers[id] = Timer(_bumpDebounce, () => _sendCount(id));
  }

  /// Shows [count] at once. `current` is the stored count on screen, which is
  /// what the first of a run of entries was made from.
  void _enterCount(String id, int count, int? current) {
    if (!_pendingCounts.containsKey(id)) _countBase[id] = current ?? 0;
    _countSeq[id] = (_countSeq[id] ?? 0) + 1;
    setState(() => _pendingCounts[id] = count);
  }

  /// Sends every `+` still waiting out the debounce — before the location
  /// changes under it, or the stocktake is closed.
  void _flushCounts() {
    for (final id in _countTimers.keys.toList()) {
      _sendCount(id);
    }
  }

  void _sendCount(String id) {
    _countTimers.remove(id)?.cancel();
    final count = _pendingCounts[id];
    if (count == null) return;
    final seq = _countSeq[id];
    // Where it was counted, not where the counter is by the time it is sent.
    final locationId = _location.id;
    _countQueue = _countQueue.then((_) async {
      final api = ref.read(apiClientProvider);
      if (api == null || !mounted) return;
      final l10n = S.of(context);
      final messenger = ScaffoldMessenger.of(context);
      // Read when it is this write's turn: an earlier write in the queue has
      // moved it on to what that one stored.
      final previous = _countBase[id] ?? 0;
      var refused = false;
      try {
        await api.stocktake.setStocktakeCount(
          stocktakeId: widget.stocktakeId,
          body: StocktakeCountRequest(
            productId: id,
            locationId: locationId,
            count: count,
            previous: previous,
          ),
        );
        _countBase[id] = count;
      } catch (error) {
        final err = unwrapError(error);
        refused = err is ApiException && err.code == 'stocktake_count_changed';
        messenger.showSnackBar(SnackBar(content: Text(describeError(l10n, error))));
      } finally {
        _refresh();
        // Wait for the reload before letting the server's number show again,
        // or the row would flick back to the old count for a moment.
        try {
          await ref.read(stocktakeProvider(widget.stocktakeId).future);
        } catch (_) {}
        // A refused count is dropped along with anything tapped since: it was
        // built on a number that no longer holds, and the row has to show
        // what is stored before anyone counts on from it.
        if (mounted && (refused || _countSeq[id] == seq)) {
          _countTimers.remove(id)?.cancel();
          setState(() => _pendingCounts.remove(id));
          _countBase.remove(id);
        }
      }
    });
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
                    PopupMenuItem(value: 'location', child: Text(l10n.stocktakeChangeLocation)),
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
                      IconButton.filled(onPressed: _submitManual, icon: const Icon(Icons.send)),
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
                    pendingCounts: _pendingCounts,
                    onCount: _count,
                    onBump: _bump,
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
                          if (e.foundByName != null) l10n.stocktakeCountedBy(e.foundByName!),
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
    required this.pendingCounts,
    required this.onTick,
    required this.onCount,
    required this.onBump,
  });

  final StocktakeDetail detail;
  final String locationId;
  final Map<String, int> pendingCounts;
  final ValueChanged<StocktakeItem> onTick;
  final void Function(StocktakeProductCount product, int? current) onCount;
  final void Function(StocktakeProductCount product, int? current) onBump;

  @override
  State<_OpenHere> createState() => _OpenHereState();
}

class _OpenHereState extends State<_OpenHere> {
  String? _categoryId;
  final _search = TextEditingController();

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  /// Every word typed has to appear somewhere in the row: "xlr 5m" finds the
  /// 5 m XLR cables, whatever the pool calls them.
  bool _matches(Iterable<String?> fields) {
    final words = _search.text.toLowerCase().split(RegExp(r'\s+')).where((w) => w.isNotEmpty);
    final haystack = fields.whereType<String>().join(' ').toLowerCase();
    return words.every(haystack.contains);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = S.of(context);
    final theme = Theme.of(context);

    final open = widget.detail.items
        .where(
          (i) =>
              i.state == StocktakeItemState.open && i.expectedLocation?.id == widget.locationId,
        )
        .toList();
    final products = widget.detail.products;

    final categories = <String, Category>{
      for (final i in open) i.category.id: i.category,
      for (final p in products) p.category.id: p.category,
    }.values.toList()..sort((a, b) => a.sortOrder.compareTo(b.sortOrder));

    bool inFilter(Category c) => _categoryId == null || c.id == _categoryId;
    final shownItems =
        open
            .where(
              (i) =>
                  inFilter(i.category) &&
                  _matches([
                    i.productName,
                    i.manufacturerName,
                    i.assetTag,
                    i.serialNumber,
                    i.bundleName,
                    i.category.name,
                    if (i.cable case final cable?) cableConnectors(cable),
                  ]),
            )
            .toList()
          ..sort((a, b) => _itemSort(a).compareTo(_itemSort(b)));
    final shownProducts =
        products
            .where(
              (p) =>
                  inFilter(p.category) &&
                  _matches([
                    p.productName,
                    p.manufacturerName,
                    p.category.name,
                    if (p.cable case final cable?) cableConnectors(cable),
                  ]),
            )
            .toList()
          ..sort(
            (a, b) => _byLabel(
              a.manufacturerName,
              a.productName,
            ).compareTo(_byLabel(b.manufacturerName, b.productName)),
          );
    final searching = _search.text.trim().isNotEmpty;

    StocktakeLocationCount? here(StocktakeProductCount p) {
      for (final l in p.locations) {
        if (l.location.id == widget.locationId) return l;
      }
      return null;
    }

    return ListView(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
          child: TextField(
            controller: _search,
            decoration: InputDecoration(
              labelText: l10n.search,
              prefixIcon: const Icon(Icons.search),
              suffixIcon: searching
                  ? IconButton(
                      icon: const Icon(Icons.clear),
                      onPressed: () => setState(_search.clear),
                    )
                  : null,
              isDense: true,
            ),
            textInputAction: TextInputAction.search,
            onChanged: (_) => setState(() {}),
          ),
        ),
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
                  _CategoryChip(
                    category: c,
                    selected: _categoryId == c.id,
                    onSelected: () => setState(() => _categoryId = c.id),
                  ),
                ],
              ],
            ),
          ),
        if (shownItems.isEmpty)
          Padding(
            padding: const EdgeInsets.all(24),
            child: Center(
              child: Text(
                searching || _categoryId != null
                    ? l10n.stocktakeNoMatch
                    : l10n.stocktakeNothingOpenHere,
              ),
            ),
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
              subtitle: _Subtitle(
                category: item.category,
                cable: item.cable,
                text: [?item.assetTag ?? item.serialNumber, ?item.bundleName].join(' · '),
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
                final mine = widget.pendingCounts[p.productId] ?? at?.myCount;
                return ListTile(
                  title: Text(productLabel(p.manufacturerName, p.productName)),
                  subtitle: _Subtitle(
                    category: p.category,
                    cable: p.cable,
                    text: l10n.stocktakeLooseLine(at?.expected ?? 0, p.counted),
                  ),
                  trailing: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(mine?.toString() ?? '–', style: theme.textTheme.titleLarge),
                      const SizedBox(width: 4),
                      // Big enough for a gloved thumb, and filled so it reads
                      // as the thing to press rather than as decoration.
                      IconButton.filledTonal(
                        tooltip: l10n.stocktakePlusOne,
                        iconSize: 28,
                        onPressed: () => widget.onBump(p, mine),
                        icon: const Icon(Icons.add),
                      ),
                    ],
                  ),
                  onTap: () => widget.onCount(p, mine),
                );
              },
            ),
        ],
        const SizedBox(height: 24),
      ],
    );
  }

  /// Alphabetical by what the row shows, not by category: someone reading
  /// the list off a shelf looks a product up by name, and the chips above
  /// already narrow it to one category.
  static String _byLabel(String? manufacturer, String product) =>
      productLabel(manufacturer, product).toLowerCase();

  static String _itemSort(StocktakeItem i) =>
      '${_byLabel(i.manufacturerName, i.productName)} ${i.assetTag ?? ''}';
}

/// A category filter in the category's own colour: a dot while it is one of
/// the choices, the whole chip once it is the choice, so the list below and
/// the chip that narrowed it share a colour.
class _CategoryChip extends StatelessWidget {
  const _CategoryChip({
    required this.category,
    required this.selected,
    required this.onSelected,
  });

  final Category category;
  final bool selected;
  final VoidCallback onSelected;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final color = parseHexColor(category.color) ?? scheme.surfaceContainerHighest;
    final foreground = contrastingTextColor(color);
    return ChoiceChip(
      avatar: selected
          ? null
          : Container(
              decoration: BoxDecoration(
                color: color,
                shape: BoxShape.circle,
                border: Border.all(color: scheme.outlineVariant),
              ),
            ),
      label: Text(category.name),
      labelStyle: selected ? TextStyle(color: foreground) : null,
      selected: selected,
      selectedColor: color,
      showCheckmark: false,
      // The default category colour is white — see CategoryPill.
      side: selected ? BorderSide(color: foreground.withValues(alpha: 0.16)) : null,
      onSelected: (_) => onSelected(),
    );
  }
}

/// A row's second line, led by its category so a mixed list can be read by
/// colour before it is read by name.
class _Subtitle extends StatelessWidget {
  const _Subtitle({required this.category, required this.text, this.cable});

  final Category category;
  final String text;

  /// A cable's ends, on a line of their own: two cables of one length differ
  /// only by these, and cut short by an ellipsis they would say nothing.
  final CableSpec? cable;

  @override
  Widget build(BuildContext context) {
    final row = Row(
      children: [
        CategoryPill(category, dense: true),
        if (text.isNotEmpty) ...[
          const SizedBox(width: 6),
          Flexible(child: Text(text, overflow: TextOverflow.ellipsis)),
        ],
      ],
    );
    return Padding(
      padding: const EdgeInsets.only(top: 2),
      child: switch (cable) {
        final cable? => Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          spacing: 2,
          children: [Text(cableConnectors(cable)), row],
        ),
        null => row,
      },
    );
  }
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

  int get _value => int.tryParse(_controller.text.trim()) ?? 0;

  void _step(int by) {
    final next = _value + by;
    if (next < 0) return;
    _controller.text = next.toString();
    _controller.selection = TextSelection.collapsed(offset: _controller.text.length);
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
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(l10n.stocktakeYourCount, style: Theme.of(context).textTheme.bodyMedium),
          const SizedBox(height: 8),
          Row(
            children: [
              IconButton.filledTonal(
                tooltip: l10n.stocktakeMinusOne,
                onPressed: () => _step(-1),
                icon: const Icon(Icons.remove),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: TextField(
                  controller: _controller,
                  autofocus: true,
                  textAlign: TextAlign.center,
                  keyboardType: TextInputType.number,
                  inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                  decoration: const InputDecoration(hintText: '0'),
                  onSubmitted: (_) => _save(),
                ),
              ),
              const SizedBox(width: 8),
              IconButton.filledTonal(
                tooltip: l10n.stocktakePlusOne,
                onPressed: () => _step(1),
                icon: const Icon(Icons.add),
              ),
            ],
          ),
        ],
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: Text(l10n.cancel)),
        FilledButton(onPressed: _save, child: Text(l10n.save)),
      ],
    );
  }
}

class _NoteDialog extends StatefulWidget {
  const _NoteDialog({required this.title, required this.note, required this.needsAttention});

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
