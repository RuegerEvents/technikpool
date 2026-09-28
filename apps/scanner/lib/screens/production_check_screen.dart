import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/client.dart';
import '../api/generated/export.dart';
import '../l10n/generated/app_localizations.dart';
import '../scan/camera_scan_screen.dart';
import '../scan/scan_tones.dart';
import '../state/providers.dart';
import '../theme.dart';

/// Checking a production's equipment against its list (Prüfen): scan or tick
/// what is there, as often as needed, with others ticking into the same list.
/// Nothing about an asset changes.
///
/// Unlike a case check the ticks live on the server, because several people
/// check one production at once — so every scan is a round trip, and the list
/// is reloaded every few seconds to show the others' ticks. On the production's
/// own side this is also where lent units are confirmed as received and later
/// reported as sent back. See services/production-check.ts on the web.
class ProductionCheckScreen extends ConsumerStatefulWidget {
  const ProductionCheckScreen({
    super.key,
    required this.productionId,
    required this.productionName,
  });

  final String productionId;
  final String productionName;

  @override
  ConsumerState<ProductionCheckScreen> createState() => _ProductionCheckScreenState();
}

enum _Tone { good, info, warn, bad }

class _ProductionCheckScreenState extends ConsumerState<ProductionCheckScreen> {
  final _manualController = TextEditingController();
  final _feedback = StreamController<CameraScanFeedback>.broadcast();
  StreamSubscription<String>? _sub;
  Timer? _poll;

  /// One scan after another, as in the other scanning screens.
  Future<void> _queue = Future<void>.value();
  bool _busy = false;

  ProductionCheck? _check;
  Object? _loadError;
  ({_Tone tone, String title, String? detail})? _last;

  @override
  void initState() {
    super.initState();
    // Listens even while the camera is on top: the camera feeds the bus.
    _sub = ref.read(scanBusProvider).codes.listen(_enqueue);
    unawaited(_start());
    // Others tick at the same time, and nothing tells this screen when.
    _poll = Timer.periodic(const Duration(seconds: 10), (_) => _reload());
  }

  @override
  void dispose() {
    _poll?.cancel();
    _sub?.cancel();
    _manualController.dispose();
    _feedback.close();
    super.dispose();
  }

  /// Joins this side's open check, or starts one.
  Future<void> _start() async {
    final api = ref.read(apiClientProvider);
    if (api == null) return;
    try {
      final check = await api.productionCheck.startProductionCheck(
        productionId: widget.productionId,
      );
      if (mounted) setState(() => _check = check);
    } catch (error) {
      if (mounted) setState(() => _loadError = error);
    }
  }

  Future<void> _reload() async {
    final check = _check;
    final api = ref.read(apiClientProvider);
    if (check == null || api == null || check.status != ProductionCheckStatus.open) return;
    try {
      final fresh = await api.productionCheck.getProductionCheck(checkId: check.id);
      if (mounted) setState(() => _check = fresh);
    } catch (_) {
      // A missed poll is caught up by the next one.
    }
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
    final check = _check;
    final api = ref.read(apiClientProvider);
    if (!mounted || check == null || api == null) return;
    if (check.status != ProductionCheckStatus.open) return;
    // Read before the first await — see SessionScreen._submit.
    final l10n = S.of(context);

    setState(() => _busy = true);
    try {
      final result = await api.productionCheck.scanIntoProductionCheck(
        checkId: check.id,
        body: ProductionCheckScanRequest(code: code),
      );
      switch (result.result) {
        case ProductionCheckScanResultResult.ticked:
          _report(
            _Tone.good,
            result.ticked > 1
                ? l10n.productionCheckWithAccessories(result.productName, result.ticked - 1)
                : result.productName,
            result.assetTag,
            ScanTone.ok,
          );
          unawaited(HapticFeedback.lightImpact());
        case ProductionCheckScanResultResult.already:
          _report(
            _Tone.info,
            '${l10n.productionCheckAlready}: ${result.productName}',
            result.assetTag,
            ScanTone.already,
          );
        default:
          _report(
            _Tone.warn,
            '${l10n.productionCheckNotOnList}: ${result.productName}',
            result.assetTag,
            ScanTone.attention,
          );
          unawaited(HapticFeedback.mediumImpact());
      }
      await _reload();
    } catch (error) {
      _report(_Tone.bad, describeError(l10n, error), code, ScanTone.error);
      unawaited(HapticFeedback.heavyImpact());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
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
    ref.scanTone(sound);
  }

  /// Runs one server action and reloads, reporting a failure in the banner.
  Future<void> _act(Future<String?> Function(ApiClient api, String checkId) action) async {
    final check = _check;
    final api = ref.read(apiClientProvider);
    if (check == null || api == null) return;
    final l10n = S.of(context);
    setState(() => _busy = true);
    try {
      final message = await action(api, check.id);
      final fresh = await api.productionCheck.getProductionCheck(checkId: check.id);
      if (!mounted) return;
      setState(() => _check = fresh);
      if (message != null) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
      }
    } catch (error) {
      _report(_Tone.bad, describeError(l10n, error), null, ScanTone.error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _toggle(ProductionCheckItem item) => _act((api, checkId) async {
    if (item.tick == null) {
      await api.productionCheck.tickProductionCheckItems(
        checkId: checkId,
        body: ProductionCheckTickRequest(assetIds: [item.assetId]),
      );
    } else {
      await api.productionCheck.untickProductionCheckItem(
        checkId: checkId,
        assetId: item.assetId,
      );
    }
    return null;
  });

  void _tickAll(List<ProductionCheckItem> open) => _act((api, checkId) async {
    await api.productionCheck.tickProductionCheckItems(
      checkId: checkId,
      body: ProductionCheckTickRequest(assetIds: [for (final i in open) i.assetId]),
    );
    return null;
  });

  void _confirmReceipt() {
    final l10n = S.of(context);
    _act((api, checkId) async {
      final result = await api.productionCheck.confirmProductionCheckReceipt(
        checkId: checkId,
      );
      return l10n.productionCheckReceiptDone(result.count);
    });
  }

  void _reportReturn() {
    final l10n = S.of(context);
    _act((api, checkId) async {
      final result = await api.productionCheck.reportProductionCheckReturn(
        checkId: checkId,
      );
      return l10n.productionCheckReturnDone(result.count);
    });
  }

  void _finish() {
    final l10n = S.of(context);
    _act((api, checkId) async {
      final result = await api.productionCheck.closeProductionCheck(checkId: checkId);
      return l10n.productionCheckSaved(result.found, result.missing);
    });
  }

  Future<void> _openCamera() => Navigator.of(context).push<void>(
    MaterialPageRoute(
      builder: (_) => CameraScanScreen(
        title: widget.productionName,
        continuous: true,
        feedback: _feedback.stream,
      ),
    ),
  );

  @override
  Widget build(BuildContext context) {
    final l10n = S.of(context);
    final check = _check;
    final open = check?.status == ProductionCheckStatus.open;
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.productionName),
        actions: [
          if (open && ref.watch(scanSettingsProvider).cameraEnabled)
            IconButton(
              tooltip: l10n.scanWithCamera,
              onPressed: _openCamera,
              icon: const Icon(Icons.photo_camera_outlined),
            ),
        ],
      ),
      body: Column(
        children: [
          if (open)
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 12, 12, 4),
              child: TextField(
                controller: _manualController,
                textInputAction: TextInputAction.done,
                decoration: InputDecoration(
                  labelText: l10n.manualEntry,
                  prefixIcon: const Icon(Icons.qr_code_scanner),
                ),
                onSubmitted: (_) => _submitManual(),
              ),
            ),
          if (_busy || check == null && _loadError == null)
            const LinearProgressIndicator()
          else
            const SizedBox(height: 4),
          if (_last case final last?) _FeedbackBanner(last.tone, last.title, last.detail),
          Expanded(
            child: switch ((check, _loadError)) {
              (final ProductionCheck c, _) => _list(l10n, c),
              (_, final Object error) => Center(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Text(describeError(l10n, error), textAlign: TextAlign.center),
                ),
              ),
              _ => const SizedBox.shrink(),
            },
          ),
          if (check != null) _footer(l10n, check),
        ],
      ),
    );
  }

  Widget _list(S l10n, ProductionCheck check) {
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final status = Theme.of(context).extension<StatusColors>();
    final open = check.status == ProductionCheckStatus.open;
    final found = check.items.where((i) => i.tick != null).length;
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
              Text(
                check.side.own
                    ? l10n.productionCheckEverything
                    : l10n.productionCheckUnitsOf(check.side.organizationName),
                style: TextStyle(color: muted, fontSize: 12),
              ),
              if (!open) Text(l10n.productionCheckClosed, style: TextStyle(color: muted)),
            ],
          ),
        ),
        const Divider(),
        if (check.items.isEmpty)
          Padding(
            padding: const EdgeInsets.all(24),
            child: Center(child: Text(l10n.productionCheckEmpty)),
          ),
        for (final (index, item) in check.items.indexed) ...[
          // The server sorts by section; a heading starts wherever it changes.
          if (index == 0 || !_sameGroup(check.items[index - 1].group, item.group))
            _sectionHeader(l10n, check, item.group, open),
          CheckboxListTile(
            value: item.tick != null,
            // Whoever ticked a unit owns the tick, as in a stocktake.
            onChanged: open && (item.tick == null || item.tick!.mine) && !_busy
                ? (_) => _toggle(item)
                : null,
            controlAffinity: ListTileControlAffinity.leading,
            dense: true,
            contentPadding: EdgeInsets.only(
              left: item.accessoryOf == null ? 8 : 40,
              right: 16,
            ),
            title: Text(
              item.productName,
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
            subtitle: Text(
              [
                item.assetTag ?? l10n.caseCheckNoTag,
                if (item.tick case final tick? when !tick.mine)
                  l10n.productionCheckFoundBy(tick.userName),
                ?_handover(l10n, item),
              ].join(' · '),
            ),
          ),
        ],
        if (check.unexpected.isNotEmpty) ...[
          const Divider(),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 4),
            child: Text(
              l10n.productionCheckNotOnList,
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
          ),
          for (final u in check.unexpected)
            ListTile(
              dense: true,
              leading: Icon(Icons.warning_amber_outlined, color: status?.warning),
              title: Text(u.productName),
              subtitle: Text(
                u.assetTag ?? '—',
                style: const TextStyle(fontFamily: 'monospace'),
              ),
            ),
        ],
      ],
    );
  }

  static bool _sameGroup(ProductionCheckGroup a, ProductionCheckGroup b) =>
      a.kind == b.kind && a.name == b.name;

  Widget _sectionHeader(
    S l10n,
    ProductionCheck check,
    ProductionCheckGroup group,
    bool open,
  ) {
    final members = check.items.where((i) => _sameGroup(i.group, group)).toList();
    final left = members.where((i) => i.tick == null).toList();
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 8, 0),
      child: Row(
        children: [
          Icon(
            group.kind == ProductionCheckGroupKind.lender
                ? Icons.handshake_outlined
                : Icons.place_outlined,
            size: 18,
            color: muted,
          ),
          const SizedBox(width: 6),
          Expanded(
            child: Text(
              '${switch (group.kind) {
                ProductionCheckGroupKind.lender => l10n.productionCheckLentBySection(group.name ?? ''),
                ProductionCheckGroupKind.location => group.name ?? '',
                _ => l10n.productionCheckNoLocation,
              }}  ${members.length - left.length}/${members.length}',
              style: const TextStyle(fontWeight: FontWeight.w600),
              overflow: TextOverflow.ellipsis,
            ),
          ),
          if (open && left.isNotEmpty)
            TextButton(
              onPressed: _busy ? null : () => _tickAll(left),
              child: Text(l10n.productionCheckTickSection),
            ),
        ],
      ),
    );
  }

  /// Where a unit stands: not handed over yet, or — lent units only — how far
  /// the handover got.
  String? _handover(S l10n, ProductionCheckItem item) {
    if (item.status == ProductionCheckItemStatus.approved) {
      return l10n.productionCheckNotOut;
    }
    if (item.lentBy == null) return null;
    if (item.returnReported) return l10n.productionCheckReturnReported;
    if (item.received) return l10n.productionCheckReceived;
    return l10n.productionCheckReceiptOpen;
  }

  Widget _footer(S l10n, ProductionCheck check) {
    final open = check.items.where((i) => i.tick == null).toList();
    final isOpen = check.status == ProductionCheckStatus.open;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
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
            Text(
              open.isEmpty
                  ? l10n.caseCheckComplete
                  : l10n.caseCheckMissingCount(open.length),
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
            if (check.canConfirmReceipt > 0 || check.canReportReturn > 0) ...[
              const SizedBox(height: 4),
              Text(
                l10n.productionCheckLentHint,
                style: TextStyle(color: muted, fontSize: 12),
              ),
              const SizedBox(height: 4),
              if (check.canConfirmReceipt > 0)
                FilledButton.tonal(
                  onPressed: _busy ? null : _confirmReceipt,
                  child: Text(l10n.productionCheckConfirmReceipt(check.canConfirmReceipt)),
                ),
              if (check.canReportReturn > 0)
                OutlinedButton(
                  onPressed: _busy ? null : _reportReturn,
                  child: Text(l10n.productionCheckReportReturn(check.canReportReturn)),
                ),
            ],
            if (isOpen) ...[
              const SizedBox(height: 8),
              Row(
                children: [
                  if (open.isNotEmpty) ...[
                    Expanded(
                      child: OutlinedButton(
                        onPressed: _busy ? null : () => _tickAll(open),
                        child: Text(l10n.productionCheckTickAll),
                      ),
                    ),
                    const SizedBox(width: 8),
                  ],
                  Expanded(
                    child: FilledButton(
                      onPressed: _busy ? null : _finish,
                      child: Text(l10n.productionCheckFinish),
                    ),
                  ),
                ],
              ),
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
