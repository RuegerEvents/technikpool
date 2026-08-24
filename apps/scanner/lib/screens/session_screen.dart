import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/client.dart';
import '../api/generated/export.dart';
import '../l10n/labels.dart';
import '../l10n/strings.dart';
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
          title: '${result.asset.manufacturerName} ${result.asset.productName}',
          detail: returned.isEmpty
              ? Labels.scanAction(result.action)
              : '${Labels.scanAction(result.action)} · zurück von ${returned.join(', ')}',
        ),
      );
      // Warehouse users watch the shelf, not the screen — the feedback has to
      // be audible and physical, not just visual.
      unawaited(SystemSound.play(SystemSoundType.click));
      unawaited(HapticFeedback.lightImpact());
    } catch (error) {
      _push(_Entry(tag: tag, ok: false, title: tag, detail: describeError(error)));
      unawaited(HapticFeedback.heavyImpact());
    } finally {
      if (mounted) setState(() => _busy = false);
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
    final scheme = Theme.of(context).colorScheme;
    final status = StatusColors.of(context);
    final camera = ref.watch(scanSettingsProvider).cameraEnabled;

    return Scaffold(
      appBar: AppBar(
        title: Text(widget.targetName, overflow: TextOverflow.ellipsis),
        actions: [
          if (camera)
            IconButton(
              tooltip: S.scanWithCamera,
              onPressed: _openCamera,
              icon: const Icon(Icons.photo_camera_outlined),
            ),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(30),
          child: Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Text(
              '${_entries.length} ${S.scansLabel} · $_okCount ${S.okLabel} · $_errorCount ${S.errorLabel}',
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
                label: const Text(S.scanWithCamera),
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
                  _busy ? '…' : S.scanNow,
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
                ? const Center(child: Text(S.sessionEmpty))
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
                    decoration: const InputDecoration(
                      labelText: S.manualEntry,
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
    );
  }
}
