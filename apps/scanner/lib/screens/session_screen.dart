import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/client.dart';
import '../api/generated/export.dart';
import '../l10n/labels.dart';
import '../l10n/generated/app_localizations.dart';
import '../product_label.dart';
import '../scan/camera_scan_screen.dart';
import '../state/providers.dart';
import '../theme.dart';

class _Entry {
  _Entry({required this.tag, required this.ok, required this.title, required this.detail})
    : at = DateTime.now();

  final String tag;
  final bool ok;
  final String title;
  final String detail;
  final DateTime at;

  CameraScanFeedback get feedback =>
      CameraScanFeedback(ok: ok, title: title, detail: '$tag · $detail');
}

/// The working screen: everything the trigger produces is booked against the
/// chosen target and appended to a running log.
class SessionScreen extends ConsumerStatefulWidget {
  const SessionScreen({
    super.key,
    required this.targetType,
    required this.targetId,
    required this.targetName,
  });

  final ScanRequestTargetType targetType;
  final String targetId;
  final String targetName;

  @override
  ConsumerState<SessionScreen> createState() => _SessionScreenState();
}

class _SessionScreenState extends ConsumerState<SessionScreen> {
  final _entries = <_Entry>[];
  final _manualController = TextEditingController();
  final _feedback = StreamController<CameraScanFeedback>.broadcast();
  StreamSubscription<String>? _sub;

  /// Scans arrive faster than the round trip they cause, so they are booked one
  /// after another rather than dropped while one is in flight. Losing a scan
  /// silently is the worst thing this screen could do — the operator has
  /// already moved the box.
  Future<void> _queue = Future<void>.value();
  bool _busy = false;

  int get _okCount => _entries.where((e) => e.ok).length;
  int get _errorCount => _entries.length - _okCount;

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

  void _enqueue(String tag) {
    if (tag.trim().isEmpty) return;
    _queue = _queue.then((_) => _submit(tag.trim()));
  }

  Future<void> _submit(String tag) async {
    final api = ref.read(apiClientProvider);
    if (api == null) return;

    // Read before the await: this runs on after a round trip, and reaching for
    // an InheritedWidget through a possibly-unmounted context is how that ends
    // in a crash rather than a label.
    final l10n = S.of(context);

    if (mounted) setState(() => _busy = true);
    try {
      final result = await api.scanning.createScan(
        body: ScanRequest(
          assetTag: tag,
          targetType: widget.targetType,
          targetId: widget.targetId,
        ),
      );
      final returned = result.returnedFrom;
      _push(
        _Entry(
          tag: tag,
          ok: true,
          title: productLabel(result.asset.manufacturerName, result.asset.productName),
          detail: returned.isEmpty
              ? Labels.scanAction(l10n, result.action)
              : '${Labels.scanAction(l10n, result.action)} · '
                    '${l10n.returnedFrom(returned.join(', '))}',
        ),
      );
      // Warehouse users watch the shelf, not the screen — the feedback has to
      // be audible and physical, not just visual.
      unawaited(SystemSound.play(SystemSoundType.click));
      unawaited(HapticFeedback.lightImpact());

      // A unit taken out of its kit, or off the unit it hangs off, was booked
      // on its own; what it belongs with is offered now. The sheet holds the
      // queue, so scans made meanwhile wait their turn rather than vanish.
      final group = result.group;
      if (group != null && group.units.any((u) => !u.done)) await _offerGroup(group);
    } catch (error) {
      _push(_Entry(tag: tag, ok: false, title: tag, detail: describeError(l10n, error)));
      unawaited(HapticFeedback.heavyImpact());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _offerGroup(ScanGroup group) async {
    if (!mounted) return;
    final l10n = S.of(context);
    final picked = await showModalBottomSheet<Set<String>>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      isDismissible: false,
      builder: (_) => _GroupSheet(group: group),
    );
    final api = ref.read(apiClientProvider);
    if (picked == null || picked.isEmpty || api == null) return;
    try {
      final booked = await api.scanning.createScanBatch(
        body: ScanBatchRequest(
          assetIds: picked.toList(),
          targetType: ScanBatchRequestTargetType.fromJson(widget.targetType.toJson()),
          targetId: widget.targetId,
        ),
      );
      _push(
        _Entry(
          tag: '',
          ok: true,
          title: group.kind == ScanGroupKind.bundle
              ? l10n.stocktakeBundle(group.name)
              : l10n.groupBelongsWith(group.name),
          detail: l10n.groupBooked(booked.count),
        ),
      );
      unawaited(HapticFeedback.lightImpact());
    } catch (error) {
      _push(_Entry(tag: '', ok: false, title: group.name, detail: describeError(l10n, error)));
      unawaited(HapticFeedback.heavyImpact());
    }
  }

  void _push(_Entry entry) {
    if (!_feedback.isClosed) _feedback.add(entry.feedback);
    if (!mounted) return;
    setState(() => _entries.insert(0, entry));
  }

  void _submitManual() {
    // Deliberately not routed through the scan bus: retyping the same tag is
    // something the operator meant to do, and the bus would eat it as an echo.
    final tag = _manualController.text.trim();
    if (tag.isNotEmpty) _queue = _queue.then((_) => _submit(tag));
    _manualController.clear();
  }

  Future<void> _openCamera() => Navigator.of(context).push<void>(
    MaterialPageRoute(
      builder: (_) => CameraScanScreen(
        title: widget.targetName,
        continuous: true,
        feedback: _feedback.stream,
      ),
    ),
  );

  @override
  Widget build(BuildContext context) {
    final l10n = S.of(context);
    final scheme = Theme.of(context).colorScheme;
    final status = StatusColors.of(context);
    final camera = ref.watch(scanSettingsProvider).cameraEnabled;

    return Scaffold(
      appBar: AppBar(
        title: Text(widget.targetName, overflow: TextOverflow.ellipsis),
        actions: [
          if (camera)
            IconButton(
              tooltip: l10n.scanWithCamera,
              onPressed: _openCamera,
              icon: const Icon(Icons.photo_camera_outlined),
            ),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(30),
          child: Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Text(
              '${_entries.length} ${l10n.scansLabel} · $_okCount ${l10n.okLabel} · $_errorCount ${l10n.errorLabel}',
            ),
          ),
        ),
      ),
      body: Column(
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
            // Inverts while a scan is in flight. A colour change this large is
            // the point: it has to be readable at arm's length by someone
            // looking at the shelf, not at the screen.
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
                    itemBuilder: (_, i) {
                      final e = _entries[i];
                      return ListTile(
                        leading: Icon(
                          e.ok ? Icons.check_circle : Icons.error,
                          color: e.ok ? status.success : scheme.error,
                          size: 30,
                        ),
                        title: Text(
                          e.title,
                          style: const TextStyle(fontWeight: FontWeight.w600),
                        ),
                        subtitle: Text('${e.tag} · ${e.detail}'),
                      );
                    },
                  ),
          ),
          // Fallback for a device whose broadcast settings aren't right yet, or
          // a sticker too damaged for either the trigger or the camera to read.
          Padding(
            padding: EdgeInsets.fromLTRB(
              12,
              8,
              12,
              8 + MediaQuery.of(context).viewInsets.bottom,
            ),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _manualController,
                    textInputAction: TextInputAction.send,
                    decoration: InputDecoration(labelText: l10n.manualEntry, isDense: true),
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
    );
  }
}

/// The rest of a scanned unit's kit, or the unit it hangs off and that unit's
/// other accessories — everything not already there checked, since "the rest
/// too" is the usual answer and leaving one out is the deliberate act.
class _GroupSheet extends StatefulWidget {
  const _GroupSheet({required this.group});

  final ScanGroup group;

  @override
  State<_GroupSheet> createState() => _GroupSheetState();
}

class _GroupSheetState extends State<_GroupSheet> {
  late final _checked = {
    for (final u in widget.group.units)
      if (!u.done) u.id,
  };

  @override
  Widget build(BuildContext context) {
    final l10n = S.of(context);
    final theme = Theme.of(context);
    final group = widget.group;
    return SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.8),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 4),
              child: Text(
                group.kind == ScanGroupKind.bundle
                    ? l10n.stocktakeBundle(group.name)
                    : l10n.groupBelongsWith(group.name),
                style: theme.textTheme.titleMedium,
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: Text(
                l10n.groupBookHint,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
            ),
            Flexible(
              child: ListView(
                shrinkWrap: true,
                children: [
                  for (final u in group.units)
                    CheckboxListTile(
                      value: u.done || _checked.contains(u.id),
                      onChanged: u.done
                          ? null
                          : (on) => setState(
                              () => on == true ? _checked.add(u.id) : _checked.remove(u.id),
                            ),
                      title: Text(productLabel(u.manufacturerName, u.productName)),
                      subtitle: Text(
                        [?u.assetTag, if (u.done) l10n.groupAlreadyThere].join(' · '),
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
                      child: Text(l10n.groupOnlyThis),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: FilledButton(
                      onPressed: _checked.isEmpty
                          ? null
                          : () => Navigator.of(context).pop(_checked),
                      child: Text(l10n.groupBook(_checked.length)),
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
