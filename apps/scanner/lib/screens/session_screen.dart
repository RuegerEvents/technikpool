import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/client.dart';
import '../api/generated/export.dart';
import '../l10n/labels.dart';
import '../l10n/strings.dart';
import '../state/providers.dart';

class _Entry {
  _Entry({required this.tag, required this.ok, required this.title, required this.detail})
    : at = DateTime.now();

  final String tag;
  final bool ok;
  final String title;
  final String detail;
  final DateTime at;
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
  StreamSubscription<String>? _sub;
  bool _busy = false;
  String? _lastTag;
  DateTime _lastAt = DateTime.fromMillisecondsSinceEpoch(0);

  int get _okCount => _entries.where((e) => e.ok).length;
  int get _errorCount => _entries.length - _okCount;

  @override
  void initState() {
    super.initState();
    _sub = ref.read(scanChannelProvider).scans.listen(_onScan);
  }

  @override
  void dispose() {
    _sub?.cancel();
    _manualController.dispose();
    super.dispose();
  }

  void _onScan(String raw) {
    final tag = raw.trim();
    if (tag.isEmpty) return;
    // Scanners often fire twice on one trigger pull; ignore the echo.
    final now = DateTime.now();
    if (tag == _lastTag && now.difference(_lastAt) < const Duration(seconds: 2)) return;
    _lastTag = tag;
    _lastAt = now;
    unawaited(_submit(tag));
  }

  Future<void> _submit(String tag) async {
    if (_busy) return;
    final api = ref.read(apiClientProvider);
    if (api == null) return;

    setState(() => _busy = true);
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
    if (!mounted) return;
    setState(() => _entries.insert(0, entry));
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.targetName, overflow: TextOverflow.ellipsis),
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
          Container(
            width: double.infinity,
            color: _busy ? scheme.tertiaryContainer : scheme.surfaceContainerHighest,
            padding: const EdgeInsets.symmetric(vertical: 14),
            child: Center(
              child: Text(
                _busy ? '…' : S.scanNow,
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
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
                          color: e.ok ? Colors.green.shade700 : scheme.error,
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
          // a sticker too damaged to read.
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
                    onSubmitted: (v) {
                      final tag = v.trim();
                      if (tag.isNotEmpty) unawaited(_submit(tag));
                      _manualController.clear();
                    },
                  ),
                ),
                const SizedBox(width: 8),
                IconButton.filled(
                  onPressed: () {
                    final tag = _manualController.text.trim();
                    if (tag.isNotEmpty) unawaited(_submit(tag));
                    _manualController.clear();
                  },
                  icon: const Icon(Icons.send),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
