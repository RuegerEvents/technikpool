import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/client.dart';
import '../api/generated/export.dart';
import '../demo/demo_data.dart';
import '../l10n/generated/app_localizations.dart';
import '../scan/camera_scan_screen.dart';
import '../scan/scan_tones.dart';
import '../state/providers.dart';
import '../theme.dart';

/// Checking one case (Kiste checken): scan the case — a kit's tag, or any unit
/// in it — then scan what is inside and see what is missing.
///
/// The server is asked for the list once and for the verdict once; ticking
/// happens here, against the list in hand, so a scan inside the case costs no
/// round trip. Only a code that is not on the list goes back to the server, to
/// say what it is. See services/case-check.ts on the web.
class CaseCheckScreen extends ConsumerStatefulWidget {
  const CaseCheckScreen({super.key, this.initialCode});

  /// A code to open the case with straight away — the unit just looked up.
  final String? initialCode;

  @override
  ConsumerState<CaseCheckScreen> createState() => _CaseCheckScreenState();
}

enum _Tone { good, info, warn, bad }

class _CaseCheckScreenState extends ConsumerState<CaseCheckScreen> {
  final _manualController = TextEditingController();
  final _feedback = StreamController<CameraScanFeedback>.broadcast();
  StreamSubscription<String>? _sub;

  /// One scan after another, as in the other scanning screens.
  Future<void> _queue = Future<void>.value();
  bool _busy = false;

  CaseCheck? _case;
  final _found = <String>{};
  final _foreign = <({String code, String? name})>[];
  CaseCheckResult? _result;
  ({_Tone tone, String title, String? detail})? _last;

  @override
  void initState() {
    super.initState();
    // Listens even while the camera is on top: the camera feeds the bus.
    _sub = ref.read(scanBusProvider).codes.listen(_enqueue);
    if (widget.initialCode case final code?) _enqueue(code);
  }

  @override
  void dispose() {
    _sub?.cancel();
    _manualController.dispose();
    _feedback.close();
    super.dispose();
  }

  void _enqueue(String code) {
    final trimmed = code.trim();
    if (trimmed.isEmpty) return;
    _queue = _queue.then((_) => _submit(trimmed));
  }

  void _submitManual() {
    // Not through the scan bus: a retyped tag is meant, and the bus would
    // swallow it as an echo.
    _enqueue(_manualController.text);
    _manualController.clear();
  }

  Future<void> _submit(String code) async {
    if (!mounted || _result != null) return;
    final api = ref.read(apiClientProvider);
    if (api == null) return;
    // Read before the first await — see SessionScreen._submit.
    final l10n = S.of(context);

    final check = _case;
    if (check == null) {
      await _open(api, l10n, code);
      return;
    }

    if (check.tag != null && check.tag == code) {
      _report(_Tone.info, l10n.caseCheckItself, code, ScanTone.already);
      return;
    }
    final item = _match(check, code);
    if (item != null) {
      if (_found.contains(item.assetId)) {
        _report(_Tone.info, l10n.caseCheckAlready, item.name, ScanTone.already);
      } else {
        setState(() => _found.add(item.assetId));
        _report(_Tone.good, item.name, item.assetTag ?? code, ScanTone.ok);
        unawaited(HapticFeedback.lightImpact());
      }
      return;
    }

    // Not on the list: ask what it is, so "not part of this case" can say.
    setState(() => _busy = true);
    String? name;
    try {
      final asset = await api.inventory.getAssetByTag(tag: code);
      name = asset.product.manufacturerName == null
          ? asset.product.name
          : '${asset.product.manufacturerName} ${asset.product.name}';
    } catch (_) {
      name = null;
    } finally {
      if (mounted) setState(() => _busy = false);
    }
    if (!mounted) return;
    setState(() {
      if (!_foreign.any((f) => f.code == code)) _foreign.add((code: code, name: name));
    });
    _report(
      _Tone.warn,
      name == null ? l10n.caseCheckUnknownCode : '${l10n.caseCheckForeign}: $name',
      code,
      ScanTone.attention,
    );
    unawaited(HapticFeedback.mediumImpact());
  }

  Future<void> _open(ApiClient api, S l10n, String code) async {
    setState(() => _busy = true);
    try {
      final check = await api.caseCheck.getCaseCheckByCode(code: code);
      if (!mounted) return;
      setState(() {
        _case = check;
        _found
          ..clear()
          ..addAll([?check.scannedAssetId]);
        _foreign.clear();
        _last = null;
      });
      _tone(ScanTone.ok);
    } catch (error) {
      _report(_Tone.bad, describeError(l10n, error), code, ScanTone.error);
      unawaited(HapticFeedback.heavyImpact());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// By tag, or by a serial number only one unit in the case carries.
  CaseCheckItem? _match(CaseCheck check, String code) {
    for (final item in check.items) {
      if (item.assetTag == code) return item;
    }
    final lower = code.toLowerCase();
    final bySerial = check.items
        .where((i) => i.serialNumber?.toLowerCase() == lower)
        .toList();
    return bySerial.length == 1 ? bySerial.single : null;
  }

  void _report(_Tone tone, String title, String? detail, ScanTone sound) {
    if (!mounted) return;
    setState(() => _last = (tone: tone, title: title, detail: detail));
    _feedback.add(
      CameraScanFeedback(
        ok: tone != _Tone.bad && tone != _Tone.warn,
        title: title,
        detail: detail ?? '',
      ),
    );
    _tone(sound);
  }

  void _tone(ScanTone tone) {
    if (mounted) ref.scanTone(tone);
  }

  void _toggle(CaseCheckItem item) {
    if (_result != null) return;
    setState(() {
      if (!_found.remove(item.assetId)) _found.add(item.assetId);
    });
  }

  Future<void> _finish() async {
    final check = _case;
    final api = ref.read(apiClientProvider);
    if (check == null || api == null) return;
    final l10n = S.of(context);
    setState(() => _busy = true);
    try {
      final result = await api.caseCheck.recordCaseCheck(
        body: CaseCheckRequest(
          kind: check.kind,
          id: check.id,
          foundAssetIds: _found.toList(),
        ),
      );
      if (mounted) setState(() => _result = result);
    } catch (error) {
      _report(_Tone.bad, describeError(l10n, error), null, ScanTone.error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _next() => setState(() {
    _case = null;
    _result = null;
    _found.clear();
    _foreign.clear();
    _last = null;
  });

  Future<void> _openCamera() => Navigator.of(context).push<void>(
    MaterialPageRoute(
      builder: (_) => CameraScanScreen(
        title: _case?.name ?? S.of(context).caseCheck,
        continuous: true,
        feedback: _feedback.stream,
      ),
    ),
  );

  @override
  Widget build(BuildContext context) {
    final l10n = S.of(context);
    final check = _case;
    return Scaffold(
      appBar: AppBar(
        title: Text(check?.name ?? l10n.caseCheck),
        actions: [
          if (ref.watch(scanSettingsProvider).cameraEnabled)
            IconButton(
              tooltip: l10n.scanWithCamera,
              onPressed: _openCamera,
              icon: const Icon(Icons.photo_camera_outlined),
            ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 4),
            child: TextField(
              controller: _manualController,
              enabled: _result == null,
              textInputAction: TextInputAction.done,
              decoration: InputDecoration(
                labelText: l10n.manualEntry,
                prefixIcon: const Icon(Icons.qr_code_scanner),
                // The demo has no sticker to point at, so the kit's tag is shown.
                helperText: check == null && ref.watch(isDemoProvider)
                    ? l10n.caseCheckDemoHint(DemoData.cableKit.tag)
                    : null,
              ),
              onSubmitted: (_) => _submitManual(),
            ),
          ),
          if (_busy) const LinearProgressIndicator() else const SizedBox(height: 4),
          if (_last case final last?) _FeedbackBanner(last.tone, last.title, last.detail),
          Expanded(
            child: check == null
                ? Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Text(l10n.caseCheckScanCase, textAlign: TextAlign.center),
                    ),
                  )
                : _list(l10n, check),
          ),
          if (check != null) _footer(l10n, check),
        ],
      ),
    );
  }

  Widget _list(S l10n, CaseCheck check) {
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final status = Theme.of(context).extension<StatusColors>();
    final found = check.items.where((i) => _found.contains(i.assetId)).length;
    return ListView(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.only(bottom: 16),
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                l10n.caseCheckProgress(found, check.items.length),
                style: const TextStyle(fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 6),
              LinearProgressIndicator(
                value: check.items.isEmpty ? 1 : found / check.items.length,
              ),
              const SizedBox(height: 6),
              if (check.checkedOutTo case final production?)
                Text(l10n.caseCheckOutTo(production), style: TextStyle(color: muted)),
              Text(switch (check.lastCheck) {
                final last? => l10n.caseCheckLast(
                  last.at.toLocal().toString().substring(0, 16),
                  last.userName,
                  last.found,
                  last.expected,
                ),
                null => l10n.caseCheckNever,
              }, style: TextStyle(color: muted, fontSize: 12)),
            ],
          ),
        ),
        if (check.shortOfType.isNotEmpty)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
            child: Text(
              [
                l10n.caseCheckShortOfType,
                for (final line in check.shortOfType) '${line.missing} × ${line.name}',
              ].join('\n'),
              style: TextStyle(color: status?.warning),
            ),
          ),
        const Divider(),
        for (final item in check.items)
          CheckboxListTile(
            value: _found.contains(item.assetId),
            onChanged: _result == null ? (_) => _toggle(item) : null,
            controlAffinity: ListTileControlAffinity.leading,
            dense: true,
            contentPadding: EdgeInsets.only(
              left: item.accessoryOf == null ? 8 : 40,
              right: 16,
            ),
            title: Text(item.name, style: const TextStyle(fontWeight: FontWeight.w600)),
            subtitle: Text(
              [
                item.assetTag ?? l10n.caseCheckNoTag,
                '#${item.orgIndex}',
                if (!_found.contains(item.assetId) && item.awayOn != null)
                  l10n.caseCheckAwayOn(item.awayOn!),
              ].join(' · '),
            ),
          ),
        if (_foreign.isNotEmpty) ...[
          const Divider(),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 4),
            child: Text(
              l10n.caseCheckForeign,
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
          ),
          for (final f in _foreign)
            ListTile(
              dense: true,
              leading: Icon(Icons.warning_amber_outlined, color: status?.warning),
              title: Text(f.name ?? l10n.caseCheckUnknownCode),
              subtitle: Text(f.code, style: const TextStyle(fontFamily: 'monospace')),
            ),
        ],
      ],
    );
  }

  Widget _footer(S l10n, CaseCheck check) {
    final missing = check.items
        .where((i) => !_found.contains(i.assetId) && i.awayOn == null)
        .length;
    final result = _result;
    return SafeArea(
      top: false,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
        decoration: BoxDecoration(
          border: Border(top: BorderSide(color: Theme.of(context).dividerColor)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            if (result != null) ...[
              Text(
                result.missing == 0
                    ? l10n.caseCheckComplete
                    : l10n.caseCheckMissingCount(result.missing),
                style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 16),
              ),
              if (result.away > 0) Text(l10n.caseCheckAwayCount(result.away)),
              Text(l10n.caseCheckSaved),
              const SizedBox(height: 8),
              FilledButton(onPressed: _next, child: Text(l10n.caseCheckNext)),
            ] else ...[
              Text(
                missing == 0
                    ? l10n.caseCheckComplete
                    : l10n.caseCheckMissingCount(missing),
                style: const TextStyle(fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 8),
              if (check.canRecord)
                FilledButton(
                  onPressed: _busy ? null : _finish,
                  child: Text(l10n.caseCheckFinish),
                )
              else ...[
                Text(l10n.caseCheckNotSaved),
                const SizedBox(height: 8),
                OutlinedButton(onPressed: _next, child: Text(l10n.caseCheckNext)),
              ],
            ],
          ],
        ),
      ),
    );
  }
}

class _FeedbackBanner extends StatelessWidget {
  const _FeedbackBanner(this.tone, this.title, this.detail);

  final _Tone tone;
  final String title;
  final String? detail;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final status = Theme.of(context).extension<StatusColors>();
    final color = switch (tone) {
      _Tone.good => status?.success ?? scheme.primary,
      _Tone.warn => status?.warning ?? scheme.tertiary,
      _Tone.bad => scheme.error,
      _Tone.info => scheme.onSurfaceVariant,
    };
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.fromLTRB(12, 4, 12, 4),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        border: Border.all(color: color.withValues(alpha: 0.5)),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: TextStyle(fontWeight: FontWeight.w600, color: color),
          ),
          if (detail case final d? when d.isNotEmpty)
            Text(d, style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant)),
        ],
      ),
    );
  }
}
