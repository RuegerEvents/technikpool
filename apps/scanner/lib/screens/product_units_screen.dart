import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/client.dart';
import '../api/generated/export.dart';
import '../l10n/generated/app_localizations.dart';
import '../product_label.dart';
import '../scan/camera_scan_screen.dart';
import '../state/providers.dart';
import '../theme.dart';

enum _Mode { tag, register }

/// One product's units in one organization, and the two things a scanner is
/// good for there: giving untagged units the stickers now on them, and
/// registering new units by scanning their stickers. Nothing is numbered for
/// either — the tag is whatever the scan reads.
class ProductUnitsScreen extends ConsumerStatefulWidget {
  const ProductUnitsScreen({
    super.key,
    required this.product,
    required this.organization,
    required this.locationId,
  });

  final Product product;
  final Organization organization;

  /// Where new units go unless changed — the location of the unit the screen
  /// was opened from.
  final String locationId;

  @override
  ConsumerState<ProductUnitsScreen> createState() => _ProductUnitsScreenState();
}

class _ProductUnitsScreenState extends ConsumerState<ProductUnitsScreen> {
  final _units = <Asset>[];
  final _feedback = StreamController<CameraScanFeedback>.broadcast();
  StreamSubscription<String>? _sub;
  bool _loading = true;
  String? _error;
  _Mode _mode = _Mode.tag;
  late String _locationId = widget.locationId;

  /// The unit the next scan is for. Null means the next one without a tag.
  String? _picked;

  /// The last scan's outcome, shown above the list.
  ({bool ok, String text})? _last;

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
      int rank(Asset u) => (u.assetTag == null ? 0 : 2) + (u.location.id == _locationId ? 0 : 1);
      return rank(a).compareTo(rank(b)) != 0
          ? rank(a).compareTo(rank(b))
          : (a.assetTag ?? '').compareTo(b.assetTag ?? '');
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
    if (code.trim().isEmpty) return;
    if (!_canEdit(ref.read(currentUserProvider).value)) return;
    _queue = _queue.then((_) => _submit(code.trim()));
  }

  Future<void> _submit(String code) async {
    final api = ref.read(apiClientProvider);
    if (api == null || !mounted) return;
    // Read before the await — see SessionScreen._submit.
    final l10n = S.of(context);
    final label = productLabel(widget.product.manufacturerName, widget.product.name);

    setState(() => _busy = true);
    try {
      if (_mode == _Mode.tag) {
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
      } else {
        final created = await api.inventory.createAsset(
          body: AssetCreateRequest(
            productId: widget.product.id,
            organizationId: widget.organization.id,
            locationId: _locationId,
            assetTag: code,
          ),
        );
        if (mounted) setState(() => _units.add(created));
        _report(true, code, l10n.productRegistered(code));
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
    if (ok) {
      unawaited(SystemSound.play(SystemSoundType.click));
      unawaited(HapticFeedback.lightImpact());
    } else {
      unawaited(HapticFeedback.heavyImpact());
    }
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
    final status = StatusColors.of(context);
    final camera = ref.watch(scanSettingsProvider).cameraEnabled;
    final canEdit = _canEdit(ref.watch(currentUserProvider).value);
    final locations = (ref.watch(locationsProvider).value ?? const <Location>[])
        .where((l) => l.organization.id == widget.organization.id)
        .toList();
    final units = _sorted;
    final untagged = units.where((u) => u.assetTag == null).length;
    final target = _mode == _Mode.tag ? _target : null;

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              productLabel(widget.product.manufacturerName, widget.product.name),
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
          if (camera && canEdit)
            IconButton(
              tooltip: l10n.scanWithCamera,
              onPressed: _openCamera,
              icon: const Icon(Icons.photo_camera_outlined),
            ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          children: [
            if (!canEdit)
              Padding(
                padding: const EdgeInsets.all(16),
                child: Text(l10n.productNeedsAdmin(widget.organization.name)),
              )
            else ...[
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
                child: SegmentedButton<_Mode>(
                  segments: [
                    ButtonSegment(
                      value: _Mode.tag,
                      icon: const Icon(Icons.sell_outlined),
                      label: Text(l10n.productModeTag),
                    ),
                    ButtonSegment(
                      value: _Mode.register,
                      icon: const Icon(Icons.add_box_outlined),
                      label: Text(l10n.productModeRegister),
                    ),
                  ],
                  selected: {_mode},
                  onSelectionChanged: (s) => setState(() {
                    _mode = s.single;
                    _picked = null;
                  }),
                ),
              ),
              if (_mode == _Mode.register && locations.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
                  child: DropdownButtonFormField<String>(
                    initialValue: locations.any((l) => l.id == _locationId) ? _locationId : null,
                    isExpanded: true,
                    decoration: InputDecoration(labelText: l10n.productRegisterAt, isDense: true),
                    items: [
                      for (final loc in locations)
                        DropdownMenuItem(
                          value: loc.id,
                          child: Text(loc.name, overflow: TextOverflow.ellipsis),
                        ),
                    ],
                    onChanged: (v) {
                      if (v != null) setState(() => _locationId = v);
                    },
                  ),
                ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                child: Text(
                  _mode == _Mode.tag ? l10n.productTagHint : l10n.productRegisterHint,
                  style: theme.textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
                ),
              ),
              // The last outcome in a band that reads at arm's length, like the
              // session screen's, inverted while a scan is on its way.
              Container(
                margin: const EdgeInsets.fromLTRB(12, 12, 12, 0),
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                decoration: BoxDecoration(
                  color: _busy ? scheme.inverseSurface : scheme.surfaceContainerHighest,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  children: [
                    if (!_busy && _last != null) ...[
                      Icon(
                        _last!.ok ? Icons.check_circle : Icons.error,
                        color: _last!.ok ? status.success : scheme.error,
                      ),
                      const SizedBox(width: 8),
                    ],
                    Expanded(
                      child: Text(
                        _busy ? '…' : (_last?.text ?? l10n.scanNow),
                        style: TextStyle(
                          fontWeight: FontWeight.w600,
                          color: _busy ? scheme.onInverseSurface : scheme.onSurface,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
              child: Text(
                l10n.productUnitCount(units.length, untagged),
                style: theme.textTheme.titleSmall,
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
                onTap: canEdit && _mode == _Mode.tag && unit.assetTag == null
                    ? () => setState(() => _picked = _picked == unit.id ? null : unit.id)
                    : null,
              ),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }
}
