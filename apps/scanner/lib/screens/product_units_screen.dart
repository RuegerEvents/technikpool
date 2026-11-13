import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/client.dart';
import '../api/generated/export.dart';
import '../l10n/generated/app_localizations.dart';
import '../natural_sort.dart';
import '../product_label.dart';
import '../scan/camera_scan_screen.dart';
import '../scan/scan_tones.dart';
import '../state/providers.dart';
import '../widgets/scan_outcome_band.dart';
import 'asset_detail_screen.dart';
import 'device_new_screen.dart';

/// What a scan does here. The screen opens in [view], where it does nothing;
/// giving untagged units their stickers is a mode entered on purpose.
enum _Mode { view, tag }

enum _MenuAction { assignTags, registerNew, interchangeable }

/// One product's units in one organization. Opens to be looked at; the ⋮
/// menu holds the two things a scanner is good for here — giving untagged
/// units the stickers now on them (a mode of this screen, left with the
/// check mark), and registering new units of the product (the new-device
/// flow, with this product). Nothing is numbered for either — the tag is
/// whatever the scan reads. It also carries the product's one switch that
/// matters at the shelf: whether its units may be swapped for one another
/// (`notInterchangeable`, see `ScanSwap`), which is found out while packing.
class ProductUnitsScreen extends ConsumerStatefulWidget {
  const ProductUnitsScreen({
    super.key,
    required this.product,
    required this.organization,
    this.locationId,
  });

  final Product product;
  final Organization organization;

  /// The shelf to list first and to register new units on: the one the
  /// screen was opened from, if it was opened from one.
  final String? locationId;

  @override
  ConsumerState<ProductUnitsScreen> createState() => _ProductUnitsScreenState();
}

class _ProductUnitsScreenState extends ConsumerState<ProductUnitsScreen> {
  final _units = <Asset>[];
  final _feedback = StreamController<CameraScanFeedback>.broadcast();
  StreamSubscription<String>? _sub;
  bool _loading = true;
  String? _error;
  _Mode _mode = _Mode.view;

  /// Set while the new-device flow is in front, which listens for itself.
  bool _aside = false;

  /// The unit the next scan is for. Null means the next one without a tag.
  String? _picked;

  /// The last scan's outcome, shown above the list.
  ({bool ok, String text})? _last;

  /// The product's `notInterchangeable`, once read. Null until then, or when
  /// the catalog could not be asked, which leaves the switch out of the menu.
  bool? _notInterchangeable;
  bool _savingInterchangeable = false;

  /// One scan after another, never dropped — see SessionScreen._queue.
  Future<void> _queue = Future<void>.value();
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _sub = ref.read(scanBusProvider).codes.listen(_enqueue);
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  @override
  void dispose() {
    _sub?.cancel();
    _feedback.close();
    super.dispose();
  }

  Future<void> _load() async {
    final api = ref.read(apiClientProvider);
    if (api == null) return;
    final l10n = S.of(context);
    setState(() {
      _loading = true;
      _error = null;
    });
    // The switch is a side matter: a catalog that cannot be read hides it and
    // leaves the list alone.
    unawaited(
      api.catalog
          .getProduct(productId: widget.product.id)
          .then((product) {
            if (mounted) setState(() => _notInterchangeable = product.notInterchangeable ?? false);
          })
          .catchError((Object _) {}),
    );
    try {
      final page = await api.inventory.listAssets(productId: widget.product.id, limit: 200);
      if (!mounted) return;
      setState(() {
        _units
          ..clear()
          ..addAll(page.items.where((a) => a.organization.id == widget.organization.id));
      });
    } catch (error) {
      if (mounted) setState(() => _error = describeError(l10n, error));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  /// Untagged first — they are what this screen is for — the ones here before
  /// the ones elsewhere, then by tag.
  List<Asset> get _sorted => [..._units]
    ..sort((a, b) {
      int rank(Asset u) =>
          (u.assetTag == null ? 0 : 2) + (u.location.id == widget.locationId ? 0 : 1);
      return rank(a).compareTo(rank(b)) != 0
          ? rank(a).compareTo(rank(b))
          : naturalCompare(a.assetTag ?? '', b.assetTag ?? '');
    });

  /// Who the next scan goes to in tag mode: the tapped unit, or else the first
  /// untagged one in list order.
  Asset? get _target {
    if (_picked != null) {
      for (final u in _units) {
        if (u.id == _picked && u.assetTag == null) return u;
      }
    }
    for (final u in _sorted) {
      if (u.assetTag == null) return u;
    }
    return null;
  }

  bool _canEdit(CurrentUser? me) {
    if (me == null) return false;
    if (me.isAdmin) return true;
    for (final org in me.organizations) {
      if (org.id == widget.organization.id) {
        return org.role == MemberOrganizationRole.admin || org.role == MemberOrganizationRole.owner;
      }
    }
    return false;
  }

  void _enqueue(String code) {
    if (code.trim().isEmpty || _aside || !mounted) return;
    if (_mode != _Mode.tag) {
      // Looking at a product changes nothing, whatever the trigger does. A
      // quiet word on how to give stickers out, for whoever meant to.
      if (_canEdit(ref.read(currentUserProvider).value)) {
        ScaffoldMessenger.of(context)
          ..hideCurrentSnackBar()
          ..showSnackBar(SnackBar(content: Text(S.of(context).productScanViewMode)));
      }
      return;
    }
    if (!_canEdit(ref.read(currentUserProvider).value)) return;
    _queue = _queue.then((_) => _submit(code.trim()));
  }

  /// Flips `notInterchangeable`. The server decides who may (`productControl`:
  /// an ADMIN of every org holding units of it), so a refusal is reported,
  /// not prevented.
  Future<void> _toggleInterchangeable() async {
    final api = ref.read(apiClientProvider);
    final current = _notInterchangeable;
    if (api == null || current == null || _savingInterchangeable) return;
    // Read before the await — see SessionScreen._submit.
    final l10n = S.of(context);
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _savingInterchangeable = true);
    try {
      final updated = await api.catalog.updateProduct(
        productId: widget.product.id,
        body: ProductUpdateRequest(notInterchangeable: !current),
      );
      final now = updated.product.notInterchangeable ?? !current;
      if (mounted) setState(() => _notInterchangeable = now);
      messenger
        ..hideCurrentSnackBar()
        ..showSnackBar(
          SnackBar(
            content: Text(
              now ? l10n.productNotInterchangeableOn : l10n.productNotInterchangeableOff,
            ),
          ),
        );
    } catch (error) {
      messenger
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(describeError(l10n, error))));
    } finally {
      if (mounted) setState(() => _savingInterchangeable = false);
    }
  }

  /// The new-device flow for this product and organization. This screen's
  /// own scans are held back while it is open, and the list read again after.
  Future<void> _registerNew() async {
    setState(() => _aside = true);
    await Navigator.of(context).push<void>(
      MaterialPageRoute(
        builder: (_) => DeviceNewScreen(
          organizationId: widget.organization.id,
          product: widget.product,
          locationId: widget.locationId,
        ),
      ),
    );
    if (!mounted) return;
    setState(() => _aside = false);
    unawaited(_load());
  }

  Future<void> _submit(String code) async {
    final api = ref.read(apiClientProvider);
    if (api == null || !mounted) return;
    // Read before the await — see SessionScreen._submit.
    final l10n = S.of(context);
    final label = productLabel(widget.product.manufacturerName, widget.product.name);

    if (_mode != _Mode.tag) return;
    setState(() => _busy = true);
    try {
      {
        final target = _target;
        if (target == null) {
          _report(false, code, l10n.productNoUntagged);
          return;
        }
        final tagged = await api.inventory.setAssetTag(
          assetId: target.id,
          body: AssetTagRequest(assetTag: code),
        );
        _replace(tagged);
        _picked = null;
        _report(true, code, l10n.productTagged(code, '$label · ${target.location.name}'));
      }
    } catch (error) {
      _report(false, code, describeError(l10n, error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _replace(Asset asset) {
    if (!mounted) return;
    setState(() {
      final i = _units.indexWhere((u) => u.id == asset.id);
      if (i >= 0) _units[i] = asset;
    });
  }

  void _report(bool ok, String code, String text) {
    if (!_feedback.isClosed) {
      _feedback.add(CameraScanFeedback(ok: ok, title: code, detail: text));
    }
    if (mounted) ref.scanTone(ok ? ScanTone.ok : ScanTone.error);
    if (mounted) setState(() => _last = (ok: ok, text: text));
  }

  Future<void> _openCamera() => Navigator.of(context).push<void>(
    MaterialPageRoute(
      builder: (_) => CameraScanScreen(
        title: productLabel(widget.product.manufacturerName, widget.product.name),
        continuous: true,
        feedback: _feedback.stream,
      ),
    ),
  );

  @override
  Widget build(BuildContext context) {
    final l10n = S.of(context);
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final camera = ref.watch(scanSettingsProvider).cameraEnabled;
    final canEdit = _canEdit(ref.watch(currentUserProvider).value);
    final units = _sorted;
    final untagged = units.where((u) => u.assetTag == null).length;
    final target = _mode == _Mode.tag ? _target : null;

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              withCaption(
                productLabel(widget.product.manufacturerName, widget.product.name),
                widget.product.caption,
              ),
              overflow: TextOverflow.ellipsis,
            ),
            Text(
              widget.organization.name,
              style: theme.textTheme.bodySmall,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
        actions: [
          if (_mode == _Mode.tag) ...[
            if (camera)
              IconButton(
                tooltip: l10n.scanWithCamera,
                onPressed: _openCamera,
                icon: const Icon(Icons.photo_camera_outlined),
              ),
            IconButton(
              tooltip: l10n.productTagDone,
              onPressed: () => setState(() {
                _mode = _Mode.view;
                _picked = null;
                _last = null;
              }),
              icon: const Icon(Icons.check),
            ),
          ] else if (canEdit)
            PopupMenuButton<_MenuAction>(
              onSelected: (action) => switch (action) {
                _MenuAction.assignTags => setState(() {
                  _mode = _Mode.tag;
                  _last = null;
                }),
                _MenuAction.registerNew => _registerNew(),
                _MenuAction.interchangeable => _toggleInterchangeable(),
              },
              itemBuilder: (_) => [
                PopupMenuItem(
                  value: _MenuAction.assignTags,
                  enabled: untagged > 0,
                  child: ListTile(
                    leading: const Icon(Icons.sell_outlined),
                    title: Text(l10n.productModeTag),
                  ),
                ),
                PopupMenuItem(
                  value: _MenuAction.registerNew,
                  child: ListTile(
                    leading: const Icon(Icons.add_box_outlined),
                    title: Text(l10n.productModeRegister),
                  ),
                ),
                if (_notInterchangeable case final locked?) ...[
                  const PopupMenuDivider(),
                  CheckedPopupMenuItem(
                    value: _MenuAction.interchangeable,
                    checked: locked,
                    enabled: !_savingInterchangeable,
                    child: Text(l10n.productNotInterchangeable),
                  ),
                ],
              ],
            ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          children: [
            if (_mode == _Mode.tag) ...[
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                child: Text(
                  l10n.productTagHint,
                  style: theme.textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
                ),
              ),
              ScanOutcomeBand(busy: _busy, last: _last, idle: l10n.scanNow),
            ],
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
              child: Text(
                l10n.productUnitCount(units.length, untagged),
                style: theme.textTheme.titleSmall,
              ),
            ),
            if (_notInterchangeable == true)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 4, 16, 4),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(Icons.lock_outline, size: 16, color: scheme.onSurfaceVariant),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        l10n.productNotInterchangeableHint,
                        style: theme.textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
                      ),
                    ),
                  ],
                ),
              ),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.all(16),
                child: Text(_error!, style: TextStyle(color: scheme.error)),
              )
            else if (_loading && units.isEmpty)
              const Padding(
                padding: EdgeInsets.all(24),
                child: Center(child: CircularProgressIndicator()),
              ),
            for (final unit in units)
              ListTile(
                leading: Icon(
                  unit.assetTag == null ? Icons.label_off_outlined : Icons.label_outline,
                ),
                title: Text(
                  unit.assetTag ?? l10n.productUntagged,
                  style: TextStyle(
                    fontWeight: FontWeight.w600,
                    color: unit.assetTag == null ? scheme.onSurfaceVariant : null,
                  ),
                ),
                subtitle: Text([unit.location.name, ?unit.serialNumber].join(' · ')),
                trailing: target?.id == unit.id
                    ? Chip(label: Text(l10n.productNextScan), visualDensity: VisualDensity.compact)
                    : null,
                selected: _mode == _Mode.tag && _picked == unit.id,
                // Tapping picks which unit the next sticker goes to; tapping it
                // again hands the choice back to "next without a tag".
                // While giving out stickers, a tap picks which unit the next
                // one goes to; otherwise a unit opens its detail.
                onTap: _mode == _Mode.tag
                    ? unit.assetTag == null
                          ? () => setState(() => _picked = _picked == unit.id ? null : unit.id)
                          : null
                    : () => Navigator.of(context).push<void>(
                        MaterialPageRoute(
                          builder: (_) => AssetDetailScreen(
                            assetId: unit.id,
                            title: unit.assetTag ?? '#${unit.orgIndex ?? '—'}',
                          ),
                        ),
                      ),
              ),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }
}
