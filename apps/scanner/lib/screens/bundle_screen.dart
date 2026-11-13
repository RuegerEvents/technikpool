import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/client.dart';
import '../api/generated/export.dart';
import '../l10n/generated/app_localizations.dart';
import '../l10n/labels.dart';
import '../product_label.dart';
import '../scan/camera_scan_screen.dart';
import '../scan/scan_tones.dart';
import '../state/providers.dart';
import '../theme.dart';
import '../widgets/count_search_sheet.dart';
import '../widgets/product_thumb.dart';
import 'case_check_screen.dart';
import 'case_label_screen.dart';
import 'device_new_screen.dart';

/// One kit (Bundle) and everything in it. Opens to be looked at: nothing a
/// scan or a tap does changes it. For whoever may edit it (ADMIN+ of its
/// organization, `canEdit`), the pencil turns it into where it is filled:
/// every scan while this screen is in front puts the unit in — or, for
/// another kit's tag, that kit (one level deep) — a unit or inner kit is taken
/// out from its row, and loose cables without a tag are added by name. The
/// kit it sits in and the kits inside it open their own screen. See
/// services/bundles.ts on the web.
class BundleScreen extends ConsumerStatefulWidget {
  const BundleScreen({
    super.key,
    required this.bundleId,
    this.name,
    this.startEditing = false,
  });

  final String bundleId;

  /// Shown in the app bar until the kit has loaded.
  final String? name;

  /// Open straight into editing — a kit just made is there to be filled.
  final bool startEditing;

  @override
  ConsumerState<BundleScreen> createState() => _BundleScreenState();
}

enum _Tone { good, info, warn, bad }

enum _MenuAction { label, check, newDevice }

class _BundleScreenState extends ConsumerState<BundleScreen> {
  final _manualController = TextEditingController();
  final _feedback = StreamController<CameraScanFeedback>.broadcast();
  StreamSubscription<String>? _sub;

  /// One scan after another, as in the other scanning screens.
  Future<void> _queue = Future<void>.value();
  bool _busy = false;

  /// Set while a screen of its own (a case check, the label) is pushed over
  /// this one: those listen to the bus themselves, and a scan there is theirs.
  /// The camera is not one of them — it feeds this screen.
  bool _aside = false;

  BundleDetail? _bundle;

  /// Whether scans and taps change the kit. Off unless asked for.
  late bool _editing = widget.startEditing;

  bool get _canChange => _editing && (_bundle?.canEdit ?? false);
  Object? _loadError;
  ({_Tone tone, String title, String? detail})? _last;

  @override
  void initState() {
    super.initState();
    // Listens even while the camera is on top: the camera feeds the bus.
    _sub = ref.read(scanBusProvider).codes.listen(_enqueue);
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  @override
  void dispose() {
    _sub?.cancel();
    _manualController.dispose();
    _feedback.close();
    super.dispose();
  }

  Future<void> _load() async {
    final api = ref.read(apiClientProvider);
    if (api == null) return;
    setState(() => _busy = true);
    try {
      final bundle = await api.bundles.getBundle(bundleId: widget.bundleId);
      if (mounted) {
        setState(() {
          _bundle = bundle;
          _loadError = null;
        });
      }
    } catch (error) {
      if (mounted) setState(() => _loadError = error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// A changed kit, from any answer that carries it. The Inventory tab's list
  /// shows the unit count, so it is told as well.
  void _changed(BundleDetail bundle) {
    if (!mounted) return;
    setState(() => _bundle = bundle);
    ref.invalidate(bundlesProvider);
  }

  void _enqueue(String code) {
    final trimmed = code.trim();
    if (trimmed.isEmpty || _aside) return;
    _queue = _queue.then((_) => _submit(trimmed));
  }

  void _submitManual() {
    // Not through the scan bus: a retyped tag is meant, and the bus would
    // swallow it as an echo.
    _enqueue(_manualController.text);
    _manualController.clear();
  }

  Future<void> _submit(String code, {bool move = false}) async {
    if (!mounted || _aside) return;
    final api = ref.read(apiClientProvider);
    final bundle = _bundle;
    if (api == null || bundle == null) return;
    // Read before the first await — see SessionScreen._submit.
    final l10n = S.of(context);

    if (!_canChange) {
      // Calm on purpose: looking at a kit and pulling the trigger out of
      // habit is not a mistake worth an error tone.
      _report(
        _Tone.info,
        bundle.canEdit ? l10n.bundleScanViewMode : l10n.bundleReadOnly,
        code,
        ScanTone.already,
      );
      return;
    }

    setState(() => _busy = true);
    BundleScanResult result;
    try {
      result = await api.bundles.scanIntoBundle(
        bundleId: bundle.id,
        body: BundleScanRequest(code: code, moveFromOtherBundle: move ? true : null),
      );
    } catch (error) {
      _report(_Tone.bad, describeError(l10n, error), code, ScanTone.error);
      return;
    } finally {
      if (mounted) setState(() => _busy = false);
    }
    if (!mounted) return;
    _changed(result.bundle);

    final unit = result.bundle.units.where((u) => u.id == result.assetId).firstOrNull;
    final kit = result.scannedBundle;
    final name = kit != null
        ? kit.name
        : unit == null
        ? code
        : productLabel(unit.manufacturerName, unit.productName);
    final detail = unit?.assetTag ?? code;

    switch (result.outcome) {
      case BundleScanOutcome.added:
        _report(_Tone.good, l10n.bundleScanAdded(name), detail, ScanTone.ok);
      case BundleScanOutcome.alreadyIn:
        _report(_Tone.info, l10n.bundleScanAlreadyIn(name), detail, ScanTone.already);
      case BundleScanOutcome.inOtherBundle:
        await _offerMove(api, l10n, code, result.otherBundle?.name ?? '', kit?.name);
      case BundleScanOutcome.notFound:
        _report(_Tone.warn, l10n.errorAssetNotFound, code, ScanTone.error);
      case BundleScanOutcome.ambiguous:
        _report(_Tone.warn, l10n.errorSerialAmbiguous, code, ScanTone.attention);
      case BundleScanOutcome.isBundle:
        _report(_Tone.warn, l10n.bundleScanIsBundle, code, ScanTone.attention);
      case BundleScanOutcome.$unknown:
        _report(_Tone.warn, l10n.bundleScanUnknown, code, ScanTone.attention);
    }
  }

  /// The unit is in another kit: say which, and move it only when asked to.
  Future<void> _offerMove(
    ApiClient api,
    S l10n,
    String code,
    String otherName,
    String? kitName,
  ) async {
    _tone(ScanTone.attention);
    // The answer names the other kit but not the unit, which is not in this
    // one yet; asking costs a round trip and makes the question readable. A
    // scanned kit is named in the answer already.
    var unitName = kitName ?? code;
    if (kitName == null) {
      try {
        final asset = await api.inventory.getAssetByTag(tag: code);
        unitName = productLabel(asset.product.manufacturerName, asset.product.name);
      } catch (_) {
        // The code is name enough.
      }
    }
    if (!mounted) return;
    final move = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(l10n.bundleMoveTitle),
        content: Text(l10n.bundleMoveQuestion(unitName, otherName)),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: Text(l10n.cancel),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: Text(l10n.bundleMoveConfirm),
          ),
        ],
      ),
    );
    if (!mounted) return;
    if (move == true) {
      await _submit(code, move: true);
    } else {
      _report(
        _Tone.info,
        l10n.bundleMoveSkipped(unitName, otherName),
        code,
        ScanTone.already,
      );
    }
  }

  Future<void> _remove(BundleUnit unit) async {
    final bundle = _bundle;
    final api = ref.read(apiClientProvider);
    if (bundle == null || api == null) return;
    final l10n = S.of(context);
    final name = productLabel(unit.manufacturerName, unit.productName);
    final accessories = bundle.units.where((u) => u.parentAssetId == unit.id).length;
    final ok = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(l10n.bundleRemoveTitle),
        content: Text(
          accessories > 0
              ? l10n.bundleRemoveWithAccessories(name, accessories)
              : l10n.bundleRemoveQuestion(name),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: Text(l10n.cancel),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: Text(l10n.bundleRemove),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() => _busy = true);
    try {
      final fresh = await api.bundles.removeFromBundle(
        bundleId: bundle.id,
        assetId: unit.id,
      );
      _changed(fresh);
      _report(_Tone.info, l10n.bundleRemoved(name), unit.assetTag, ScanTone.ok);
    } catch (error) {
      _report(_Tone.bad, describeError(l10n, error), null, ScanTone.error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _removeInner(InnerBundle inner) async {
    final bundle = _bundle;
    final api = ref.read(apiClientProvider);
    if (bundle == null || api == null) return;
    final l10n = S.of(context);
    final name = withCaption(inner.name, inner.caption);
    final ok = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(l10n.bundleRemoveTitle),
        content: Text(l10n.bundleInnerRemoveQuestion(name)),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: Text(l10n.cancel),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: Text(l10n.bundleRemove),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() => _busy = true);
    try {
      final fresh = await api.bundles.removeBundleFromBundle(
        bundleId: bundle.id,
        innerBundleId: inner.id,
      );
      _changed(fresh);
      _report(_Tone.info, l10n.bundleRemoved(name), inner.tag, ScanTone.ok);
    } catch (error) {
      _report(_Tone.bad, describeError(l10n, error), null, ScanTone.error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// Another kit — the one this sits in, or one inside it — on its own screen.
  void _openKit(String id, String name) =>
      _openAside(BundleScreen(bundleId: id, name: name));

  Future<void> _addLoose() async {
    final bundle = _bundle;
    final api = ref.read(apiClientProvider);
    if (bundle == null || api == null) return;
    final l10n = S.of(context);
    final groups = <String, LooseGroup>{};
    await showCountSearchSheet(
      context: context,
      title: l10n.bundleAddLoose,
      actionLabel: l10n.add,
      search: (q) async {
        final found = await api.bundles.searchLooseForBundle(bundleId: bundle.id, q: q);
        groups
          ..clear()
          ..addEntries(found.map((g) => MapEntry(g.key, g)));
        return [
          for (final g in found)
            CountSearchHit(
              key: g.key,
              title: withCaption(
                productLabel(g.manufacturerName, g.productName),
                g.productCaption,
              ),
              subtitle:
                  '${g.locationName} · ${l10n.availableUntagged(g.available, g.untagged)}',
              imageUrl: g.productImageUrl,
              available: g.available,
            ),
        ];
      },
      submit: (hit, count) async {
        final group = groups[hit.key]!;
        final result = await api.bundles.addLooseToBundle(
          bundleId: bundle.id,
          body: LooseAddRequest(
            productId: group.productId,
            locationId: group.locationId,
            count: count,
          ),
        );
        _changed(result.bundle);
        return l10n.bundleLooseAdded(result.count, hit.title);
      },
    );
  }

  /// Opens a screen that scans for itself, and holds this one's scans back
  /// until it is closed — then reloads, since a case check may have moved on.
  Future<void> _openAside(Widget screen) async {
    setState(() => _aside = true);
    await Navigator.of(context).push<void>(MaterialPageRoute(builder: (_) => screen));
    if (!mounted) return;
    setState(() => _aside = false);
    unawaited(_load());
  }

  /// What opens this kit's case check: its own tag, else a unit's.
  String? _caseCode(BundleDetail bundle) =>
      bundle.tag ??
      bundle.number ??
      bundle.units.map((u) => u.assetTag).nonNulls.firstOrNull;

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

  Future<void> _openCamera() => Navigator.of(context).push<void>(
    MaterialPageRoute(
      builder: (_) => CameraScanScreen(
        title: _bundle?.name ?? widget.name ?? S.of(context).bundle,
        continuous: true,
        feedback: _feedback.stream,
      ),
    ),
  );

  @override
  Widget build(BuildContext context) {
    final l10n = S.of(context);
    final bundle = _bundle;
    final caseCode = bundle == null ? null : _caseCode(bundle);
    return Scaffold(
      appBar: AppBar(
        title: Text(bundle?.name ?? widget.name ?? l10n.bundle),
        actions: [
          if (_canChange && ref.watch(scanSettingsProvider).cameraEnabled)
            IconButton(
              tooltip: l10n.scanWithCamera,
              onPressed: _openCamera,
              icon: const Icon(Icons.photo_camera_outlined),
            ),
          if (bundle != null && bundle.canEdit)
            _editing
                ? IconButton(
                    tooltip: l10n.bundleEditDone,
                    onPressed: () => setState(() {
                      _editing = false;
                      _last = null;
                    }),
                    icon: const Icon(Icons.check),
                  )
                : IconButton(
                    tooltip: l10n.bundleEdit,
                    onPressed: () => setState(() {
                      _editing = true;
                      _last = null;
                    }),
                    icon: const Icon(Icons.edit_outlined),
                  ),
          if (bundle != null)
            PopupMenuButton<_MenuAction>(
              onSelected: (action) => switch (action) {
                _MenuAction.label => _openAside(
                  CaseLabelScreen(kind: CaseKind.bundle, id: bundle.id, name: bundle.name),
                ),
                _MenuAction.check => _openAside(
                  CaseCheckScreen(initialCode: caseCode, showEdit: false),
                ),
                _MenuAction.newDevice => _openAside(
                  DeviceNewScreen(
                    organizationId: bundle.organizationId,
                    bundleId: bundle.id,
                  ),
                ),
              },
              itemBuilder: (_) => [
                PopupMenuItem(
                  value: _MenuAction.label,
                  child: ListTile(
                    leading: const Icon(Icons.print_outlined),
                    title: Text(l10n.caseLabel),
                  ),
                ),
                if (caseCode != null)
                  PopupMenuItem(
                    value: _MenuAction.check,
                    child: ListTile(
                      leading: const Icon(Icons.checklist),
                      title: Text(l10n.caseCheck),
                    ),
                  ),
                if (_canChange)
                  PopupMenuItem(
                    value: _MenuAction.newDevice,
                    child: ListTile(
                      leading: const Icon(Icons.add_box_outlined),
                      title: Text(l10n.deviceNew),
                    ),
                  ),
              ],
            ),
        ],
      ),
      body: Column(
        children: [
          if (_canChange)
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 12, 12, 4),
              child: TextField(
                controller: _manualController,
                textInputAction: TextInputAction.done,
                decoration: InputDecoration(
                  labelText: l10n.manualEntry,
                  prefixIcon: const Icon(Icons.qr_code_scanner),
                  helperText: l10n.bundleScanHint,
                ),
                onSubmitted: (_) => _submitManual(),
              ),
            ),
          if (_busy) const LinearProgressIndicator() else const SizedBox(height: 4),
          if (_last case final last?) _FeedbackBanner(last.tone, last.title, last.detail),
          Expanded(
            child: bundle != null
                ? RefreshIndicator(onRefresh: _load, child: _list(l10n, bundle))
                : _loadError != null
                ? Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            describeError(l10n, _loadError!),
                            textAlign: TextAlign.center,
                          ),
                          const SizedBox(height: 12),
                          OutlinedButton(onPressed: _load, child: Text(l10n.retry)),
                        ],
                      ),
                    ),
                  )
                : const SizedBox.shrink(),
          ),
          if (_canChange)
            SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
                child: SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    onPressed: _busy ? null : _addLoose,
                    icon: const Icon(Icons.playlist_add),
                    label: Text(l10n.bundleAddLoose),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _list(S l10n, BundleDetail bundle) {
    final theme = Theme.of(context);
    final muted = theme.colorScheme.onSurfaceVariant;
    final status = theme.extension<StatusColors>();
    return ListView(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.only(bottom: 16),
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ProductThumb(url: bundle.imageUrl, size: 72),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      withCaption(bundle.name, bundle.caption),
                      style: theme.textTheme.titleMedium,
                    ),
                    const SizedBox(height: 2),
                    Text(
                      [
                        // Without a tag of its own, its case's tag is its number.
                        bundle.tag ??
                            (bundle.numberFromCase == true && bundle.number != null
                                ? l10n.bundleNumberFromCase(bundle.number!)
                                : l10n.bundleNoTag),
                        bundle.categoryName,
                        ?bundle.location?.name,
                      ].join(' · '),
                      style: TextStyle(color: muted),
                    ),
                    Text(
                      l10n.bundleUnitCount(bundle.unitCount),
                      style: TextStyle(color: muted, fontSize: 12),
                    ),
                    if ((bundle.extraCases ?? 0) > 0)
                      Text(
                        l10n.bundleExtraCases(bundle.extraCases!),
                        style: TextStyle(color: muted, fontSize: 12),
                      ),
                    if (!bundle.canEdit)
                      Text(
                        l10n.bundleReadOnly,
                        style: TextStyle(color: muted, fontSize: 12),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
        if (bundle.parentBundle case final parent?)
          ListTile(
            dense: true,
            leading: const Icon(Icons.inventory_2_outlined),
            title: Text(l10n.bundleInside(parent.name)),
            subtitle: parent.tag == null ? null : Text(parent.tag!),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => _openKit(parent.id, parent.name),
          ),
        const Divider(),
        if (bundle.innerBundles.isNotEmpty) ...[
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 0),
            child: Text(l10n.bundleInnerKits, style: theme.textTheme.labelLarge),
          ),
          for (final inner in bundle.innerBundles)
            ListTile(
              dense: true,
              contentPadding: EdgeInsets.only(left: 16, right: _canChange ? 4 : 16),
              leading: ProductThumb(url: inner.imageUrl, size: 36),
              title: Text(
                withCaption(inner.name, inner.caption),
                style: const TextStyle(fontWeight: FontWeight.w600),
              ),
              subtitle: Text(
                [
                  inner.tag ?? l10n.bundleNoTag,
                  l10n.bundleUnitCount(inner.unitCount),
                ].join(' · '),
              ),
              onTap: () => _openKit(inner.id, inner.name),
              trailing: _canChange
                  ? IconButton(
                      tooltip: l10n.bundleRemove,
                      onPressed: _busy ? null : () => _removeInner(inner),
                      icon: const Icon(Icons.remove_circle_outline),
                    )
                  : const Icon(Icons.chevron_right),
            ),
          const Divider(),
        ],
        if (bundle.units.isEmpty && bundle.innerBundles.isEmpty)
          Padding(
            padding: const EdgeInsets.all(24),
            child: Text(
              _canChange ? l10n.bundleEmptyEdit : l10n.bundleEmpty,
              textAlign: TextAlign.center,
              style: TextStyle(color: muted),
            ),
          ),
        for (final unit in bundle.units)
          ListTile(
            dense: true,
            contentPadding: EdgeInsets.only(
              left: unit.parentAssetId == null ? 16 : 48,
              right: unit.parentAssetId == null && _canChange ? 4 : 16,
            ),
            leading: ProductThumb(
              url: unit.productImageUrl,
              size: unit.parentAssetId == null ? 36 : 28,
            ),
            title: Text(
              withCaption(
                productLabel(unit.manufacturerName, unit.productName),
                unit.productCaption,
              ),
              style: TextStyle(
                fontWeight: unit.parentAssetId == null
                    ? FontWeight.w600
                    : FontWeight.normal,
              ),
            ),
            subtitle: Text.rich(
              TextSpan(
                children: [
                  TextSpan(
                    text: [
                      if (unit.parentAssetId != null) l10n.bundleAccessory,
                      unit.assetTag ?? l10n.bundleNoTag,
                      '#${unit.orgIndex}',
                      if (AssetStatus.fromJson(unit.status) case final s
                          when s != AssetStatus.available && s != AssetStatus.$unknown)
                        Labels.assetStatus(l10n, s),
                    ].join(' · '),
                  ),
                  if (unit.checkedOutTo case final production?)
                    TextSpan(
                      text: '\n${l10n.bundleUnitOut(production)}',
                      style: TextStyle(color: status?.warning),
                    ),
                ],
              ),
            ),
            // Accessories follow their unit out, so they have no button.
            trailing: unit.parentAssetId == null && _canChange
                ? IconButton(
                    tooltip: l10n.bundleRemove,
                    onPressed: _busy ? null : () => _remove(unit),
                    icon: const Icon(Icons.remove_circle_outline),
                  )
                : null,
          ),
      ],
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
