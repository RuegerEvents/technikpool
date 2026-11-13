import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/client.dart';
import '../api/generated/export.dart';
import '../l10n/generated/app_localizations.dart';
import '../org_access.dart';
import '../product_label.dart';
import '../register_units.dart';
import '../scan/camera_scan_screen.dart';
import '../scan/scan_tones.dart';
import '../state/providers.dart';
import '../widgets/category_field.dart';
import '../widgets/category_pill.dart';
import '../widgets/product_thumb.dart';
import '../widgets/scan_outcome_band.dart';

enum _Mode { scan, untagged }

/// The product new units are of: one from the catalogue, or the one this
/// screen made. Only what the screen shows and sends.
typedef _Product = ({
  String id,
  String? manufacturerName,
  String name,
  String? caption,
  String? imageUrl,
  Category category,
});

/// Register new devices (Geräte): which organization, which product — found
/// in the catalogue or made here —, where they are kept, optionally which kit
/// they go into, and then either one unit per scanned label or a number of
/// units without one. A new product is made once, before the first unit, and
/// every later unit is of that product.
class DeviceNewScreen extends ConsumerStatefulWidget {
  const DeviceNewScreen({
    super.key,
    this.organizationId,
    this.bundleId,
    this.product,
    this.locationId,
  });

  /// Preselected, when opened from a kit or a product.
  final String? organizationId;
  final String? bundleId;
  final String? locationId;

  /// Opened from a product's units: these are units of it, and nothing else —
  /// the product and its organization are fixed.
  final Product? product;

  @override
  ConsumerState<DeviceNewScreen> createState() => _DeviceNewScreenState();
}

class _DeviceNewScreenState extends ConsumerState<DeviceNewScreen> {
  static const _debounceFor = Duration(milliseconds: 250);
  static const _maxUntagged = 200;

  final _feedback = StreamController<CameraScanFeedback>.broadcast();
  final _manualController = TextEditingController();
  StreamSubscription<String>? _sub;

  late String? _orgId = widget.organizationId;
  late String? _locationId = widget.locationId;
  late String? _bundleId = widget.bundleId;
  _Mode _mode = _Mode.scan;
  int _count = 1;

  // The product: picked, or about to be made.
  late _Product? _product = switch (widget.product) {
    final p? => (
      id: p.id,
      manufacturerName: p.manufacturerName,
      name: p.name,
      caption: p.caption,
      imageUrl: p.imageUrl,
      category: p.category,
    ),
    null => null,
  };
  bool _newProduct = false;
  final _productName = TextEditingController();
  final _caption = TextEditingController();
  TextEditingController? _manufacturer;
  String? _categoryId;

  // Searching the catalogue.
  final _search = TextEditingController();
  Timer? _debounce;
  int _searchSeq = 0;
  List<CatalogProduct>? _hits;
  String? _searchError;
  bool _searching = false;

  /// One scan after another, as in the other scanning screens.
  Future<void> _queue = Future<void>.value();
  bool _busy = false;
  ({bool ok, String text})? _last;

  /// What was registered here, newest first.
  final _registered = <({String title, String detail})>[];

  /// Once a unit exists, the organization and product are what it was made
  /// with; changing them mid-way would split one run over two products.
  bool get _locked => _registered.isNotEmpty || widget.product != null;

  @override
  void initState() {
    super.initState();
    // Listens even while the camera is on top: the camera feeds the bus.
    _sub = ref.read(scanBusProvider).codes.listen(_enqueue);
  }

  @override
  void dispose() {
    _sub?.cancel();
    _debounce?.cancel();
    _feedback.close();
    _manualController.dispose();
    _productName.dispose();
    _caption.dispose();
    _search.dispose();
    super.dispose();
  }

  // ---------------------------------------------------------------------------
  // The product

  void _searchChanged(String _) {
    _debounce?.cancel();
    if (_search.text.trim().length < 2) {
      _searchSeq++;
      setState(() {
        _hits = null;
        _searchError = null;
        _searching = false;
      });
      return;
    }
    _debounce = Timer(_debounceFor, _runSearch);
  }

  Future<void> _runSearch() async {
    final api = ref.read(apiClientProvider);
    final q = _search.text.trim();
    if (api == null || q.length < 2) return;
    final l10n = S.of(context);
    final seq = ++_searchSeq;
    setState(() => _searching = true);
    try {
      final page = await api.catalog.listProducts(q: q, limit: 20);
      if (!mounted || seq != _searchSeq) return;
      setState(() {
        _hits = page.items;
        _searchError = null;
      });
    } catch (error) {
      if (mounted && seq == _searchSeq) {
        setState(() => _searchError = describeError(l10n, error));
      }
    } finally {
      if (mounted && seq == _searchSeq) setState(() => _searching = false);
    }
  }

  void _pick(CatalogProduct p) => setState(() {
    _product = (
      id: p.id,
      manufacturerName: p.manufacturerName,
      name: p.name,
      caption: p.caption,
      imageUrl: p.imageUrl,
      category: p.category,
    );
    _newProduct = false;
  });

  /// The product's id, making the new product first if that is what is
  /// filled in. Made once: afterwards it is the picked product.
  Future<String> _ensureProduct(ApiClient api, S l10n) async {
    if (_product case final product?) return product.id;
    final manufacturer = _manufacturer?.text.trim() ?? '';
    final caption = _caption.text.trim();
    final created = await api.catalog.createProduct(
      body: ProductCreateRequest(
        organizationId: _orgId!,
        name: _productName.text.trim(),
        manufacturerName: manufacturer.isEmpty ? null : manufacturer,
        categoryId: _categoryId!,
        caption: caption.isEmpty ? null : caption,
      ),
    );
    if (mounted) {
      setState(() {
        _product = (
          id: created.id,
          manufacturerName: created.manufacturerName,
          name: created.name,
          caption: created.caption,
          imageUrl: created.imageUrl,
          category: created.category,
        );
        _newProduct = false;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            l10n.deviceProductCreated(productLabel(created.manufacturerName, created.name)),
          ),
        ),
      );
    }
    return created.id;
  }

  /// Why nothing can be registered yet, or null when everything is in place.
  String? _missing(S l10n) {
    if (_orgId == null) return l10n.stocktakeNoOrgs;
    if (_product == null) {
      if (!_newProduct) return l10n.deviceNeedsProduct;
      if (_productName.text.trim().isEmpty || _categoryId == null) {
        return l10n.deviceNeedsNewProduct;
      }
    }
    if (_locationId == null) return l10n.deviceNeedsLocation;
    return null;
  }

  // ---------------------------------------------------------------------------
  // Registering

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
    final api = ref.read(apiClientProvider);
    if (api == null || !mounted) return;
    // Read before the first await — see SessionScreen._submit.
    final l10n = S.of(context);
    if (_mode != _Mode.scan) {
      _report(false, code, l10n.deviceScanOtherMode);
      return;
    }
    if (_missing(l10n) case final missing?) {
      _report(false, code, missing);
      return;
    }
    final orgId = _orgId!;
    final locationId = _locationId!;
    final bundleId = _bundleId;
    setState(() => _busy = true);
    try {
      final productId = await _ensureProduct(api, l10n);
      final asset = await registerTaggedUnit(
        api,
        productId: productId,
        organizationId: orgId,
        locationId: locationId,
        tag: code,
        bundleId: bundleId,
      );
      _registered.insert(0, (title: asset.assetTag ?? code, detail: asset.location.name));
      _changed(bundleId);
      _report(true, code, l10n.productRegistered(code));
    } catch (error) {
      _report(false, code, describeError(l10n, error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _registerUntagged() async {
    final api = ref.read(apiClientProvider);
    if (api == null) return;
    final l10n = S.of(context);
    if (_missing(l10n) case final missing?) {
      setState(() => _last = (ok: false, text: missing));
      return;
    }
    final orgId = _orgId!;
    final locationId = _locationId!;
    final bundleId = _bundleId;
    setState(() => _busy = true);
    try {
      final productId = await _ensureProduct(api, l10n);
      final result = await api.inventory.createUntaggedAssets(
        body: UntaggedAssetsRequest(
          organizationId: orgId,
          locationId: locationId,
          productId: productId,
          count: _count,
          bundleId: bundleId,
        ),
      );
      final text = l10n.deviceRegisteredUntagged(result.assets.length);
      _registered.insert(0, (
        title: text,
        detail: result.assets.firstOrNull?.location.name ?? '',
      ));
      _changed(bundleId);
      if (mounted) setState(() => _last = (ok: true, text: text));
      _tone(ScanTone.ok);
    } catch (error) {
      if (mounted) setState(() => _last = (ok: false, text: describeError(l10n, error)));
      _tone(ScanTone.error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// Tells whatever lists units or kits that there are more.
  void _changed(String? bundleId) {
    if (!mounted) return;
    ref.read(unitsChangedProvider.notifier).bump();
    if (bundleId != null) ref.invalidate(bundlesProvider);
  }

  void _report(bool ok, String code, String text) {
    if (!_feedback.isClosed) {
      _feedback.add(CameraScanFeedback(ok: ok, title: code, detail: text));
    }
    _tone(ok ? ScanTone.ok : ScanTone.error);
    if (mounted) setState(() => _last = (ok: ok, text: text));
  }

  void _tone(ScanTone tone) {
    if (mounted) ref.scanTone(tone);
  }

  Future<void> _openCamera() => Navigator.of(context).push<void>(
    MaterialPageRoute(
      builder: (_) => CameraScanScreen(
        title: S.of(context).deviceNew,
        continuous: true,
        feedback: _feedback.stream,
      ),
    ),
  );

  // ---------------------------------------------------------------------------
  // Drawing

  @override
  Widget build(BuildContext context) {
    final l10n = S.of(context);
    final me = ref.watch(currentUserProvider);
    final camera = ref.watch(scanSettingsProvider).cameraEnabled;

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.deviceNew),
        actions: [
          if (camera && _mode == _Mode.scan)
            IconButton(
              tooltip: l10n.scanWithCamera,
              onPressed: _openCamera,
              icon: const Icon(Icons.photo_camera_outlined),
            ),
          TextButton(onPressed: () => Navigator.of(context).pop(), child: Text(l10n.done)),
        ],
      ),
      body: me.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(child: Text(describeError(l10n, error))),
        data: (user) {
          final orgs = manageableOrgs(user);
          if (orgs.isEmpty) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Text(l10n.stocktakeNoOrgs, textAlign: TextAlign.center),
              ),
            );
          }
          if (_orgId == null || !orgs.any((o) => o.id == _orgId)) _orgId = orgs.first.id;
          final locations = (ref.watch(locationsProvider).value ?? const <Location>[])
              .where((l) => l.organization.id == _orgId)
              .toList();
          final bundles = (ref.watch(bundlesProvider('')).value ?? const <BundleSummary>[])
              .where((b) => b.organizationId == _orgId)
              .toList();
          _settleLocation(locations, bundles);

          return ListView(
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
            children: [
              if (orgs.length > 1) ...[
                DropdownButtonFormField<String>(
                  initialValue: _orgId,
                  isExpanded: true,
                  decoration: InputDecoration(labelText: l10n.stocktakeOrganization),
                  items: [
                    for (final org in orgs)
                      DropdownMenuItem(
                        value: org.id,
                        child: Text(org.name, overflow: TextOverflow.ellipsis),
                      ),
                  ],
                  onChanged: _locked
                      ? null
                      : (id) => setState(() {
                          _orgId = id;
                          // Shelves and kits belong to one organization.
                          _locationId = null;
                          _bundleId = null;
                        }),
                ),
                const SizedBox(height: 16),
              ],
              _sectionLabel(l10n.deviceProduct),
              _productSection(l10n),
              const SizedBox(height: 16),
              DropdownButtonFormField<String>(
                // Keyed so a location set from a kit shows at once.
                key: ValueKey('loc-$_orgId-$_locationId'),
                initialValue: _locationId,
                isExpanded: true,
                decoration: InputDecoration(labelText: l10n.deviceLocation),
                items: [
                  for (final loc in locations)
                    DropdownMenuItem(
                      value: loc.id,
                      child: Text(loc.name, overflow: TextOverflow.ellipsis),
                    ),
                ],
                onChanged: (id) => setState(() => _locationId = id),
              ),
              const SizedBox(height: 16),
              DropdownButtonFormField<String?>(
                key: ValueKey('kit-$_orgId-${bundles.length}'),
                initialValue: bundles.any((b) => b.id == _bundleId) ? _bundleId : null,
                isExpanded: true,
                decoration: InputDecoration(labelText: l10n.deviceBundle),
                items: [
                  DropdownMenuItem(value: null, child: Text(l10n.deviceNoBundle)),
                  for (final b in bundles)
                    DropdownMenuItem(
                      value: b.id,
                      child: Text(
                        b.tag == null ? b.name : '${b.name} · ${b.tag}',
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                ],
                onChanged: (id) => setState(() {
                  _bundleId = id;
                  // A kit's units are kept where the kit is.
                  final kit = bundles.where((b) => b.id == id).firstOrNull;
                  if (kit?.location case final loc?
                      when locations.any((l) => l.id == loc.id)) {
                    _locationId = loc.id;
                  }
                }),
              ),
              const SizedBox(height: 20),
              SegmentedButton<_Mode>(
                segments: [
                  ButtonSegment(
                    value: _Mode.scan,
                    icon: const Icon(Icons.qr_code_scanner),
                    label: Text(l10n.deviceModeScan),
                  ),
                  ButtonSegment(
                    value: _Mode.untagged,
                    icon: const Icon(Icons.label_off_outlined),
                    label: Text(l10n.deviceModeUntagged),
                  ),
                ],
                selected: {_mode},
                onSelectionChanged: (s) => setState(() {
                  _mode = s.single;
                  _last = null;
                }),
              ),
              if (_mode == _Mode.scan) ..._scanSection(l10n) else ..._untaggedSection(l10n),
              if (_registered.isNotEmpty) ...[
                const SizedBox(height: 16),
                _sectionLabel(l10n.deviceRegistered(_registered.length)),
                for (final (i, entry) in _registered.indexed)
                  ListTile(
                    key: ValueKey(i),
                    dense: true,
                    contentPadding: EdgeInsets.zero,
                    leading: const Icon(Icons.check_circle_outline),
                    title: Text(
                      entry.title,
                      style: const TextStyle(fontWeight: FontWeight.w600),
                    ),
                    subtitle: entry.detail.isEmpty ? null : Text(entry.detail),
                  ),
              ],
            ],
          );
        },
      ),
    );
  }

  /// A location once there is one to have: the kit's, else the first shelf.
  void _settleLocation(List<Location> locations, List<BundleSummary> bundles) {
    if (_locationId != null && locations.any((l) => l.id == _locationId)) return;
    final kitLocation = bundles.where((b) => b.id == _bundleId).firstOrNull?.location;
    if (kitLocation != null && locations.any((l) => l.id == kitLocation.id)) {
      _locationId = kitLocation.id;
    } else {
      _locationId = locations.firstOrNull?.id;
    }
  }

  Widget _sectionLabel(String text) => Padding(
    padding: const EdgeInsets.only(bottom: 6),
    child: Text(text, style: Theme.of(context).textTheme.titleSmall),
  );

  Widget _productSection(S l10n) {
    final scheme = Theme.of(context).colorScheme;
    final product = _product;
    if (product != null) {
      return Card(
        margin: EdgeInsets.zero,
        child: ListTile(
          leading: ProductThumb(url: product.imageUrl, size: 40),
          title: Text(
            withCaption(
              productLabel(product.manufacturerName, product.name),
              product.caption,
            ),
            style: const TextStyle(fontWeight: FontWeight.w600),
          ),
          subtitle: Align(
            alignment: AlignmentDirectional.centerStart,
            child: Padding(
              padding: const EdgeInsets.only(top: 4),
              child: CategoryPill(product.category, dense: true),
            ),
          ),
          trailing: _locked
              ? null
              : TextButton(
                  onPressed: () => setState(() => _product = null),
                  child: Text(l10n.deviceProductChange),
                ),
        ),
      );
    }

    if (_newProduct) {
      final categories = ref.watch(categoriesProvider).value ?? const <Category>[];
      final manufacturers =
          ref.watch(manufacturersProvider).value ?? const <Manufacturer>[];
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextField(
            controller: _productName,
            textCapitalization: TextCapitalization.sentences,
            decoration: InputDecoration(labelText: l10n.deviceProductName),
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: 12),
          // Suggestions from the manufacturers the catalogue knows, so the same
          // maker is not spelt three ways; anything else may be typed.
          Autocomplete<String>(
            optionsBuilder: (value) {
              final q = value.text.trim().toLowerCase();
              if (q.isEmpty) return const Iterable<String>.empty();
              return manufacturers
                  .map((m) => m.name)
                  .where((name) => name.toLowerCase().contains(q))
                  .take(8);
            },
            fieldViewBuilder: (context, controller, focusNode, onSubmitted) {
              _manufacturer = controller;
              return TextField(
                controller: controller,
                focusNode: focusNode,
                decoration: InputDecoration(labelText: l10n.deviceManufacturer),
                onSubmitted: (_) => onSubmitted(),
              );
            },
          ),
          const SizedBox(height: 12),
          CategoryField(
            categories: categories,
            value: _categoryId,
            label: l10n.bundleCategory,
            onChanged: (id) => setState(() => _categoryId = id),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _caption,
            textCapitalization: TextCapitalization.sentences,
            decoration: InputDecoration(labelText: l10n.bundleCaption),
          ),
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: TextButton.icon(
              onPressed: () => setState(() => _newProduct = false),
              icon: const Icon(Icons.search),
              label: Text(l10n.deviceProductSearchInstead),
            ),
          ),
        ],
      );
    }

    final hits = _hits;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          controller: _search,
          textInputAction: TextInputAction.search,
          decoration: InputDecoration(
            labelText: l10n.deviceProductSearch,
            prefixIcon: const Icon(Icons.search),
            isDense: true,
          ),
          onChanged: _searchChanged,
          onSubmitted: (_) {
            _debounce?.cancel();
            _runSearch();
          },
        ),
        if (_searching) const LinearProgressIndicator() else const SizedBox(height: 4),
        if (_searchError case final error?)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(error, style: TextStyle(color: scheme.error)),
          ),
        if (hits != null && hits.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Text(l10n.noResults, style: TextStyle(color: scheme.onSurfaceVariant)),
          ),
        for (final p in hits ?? const <CatalogProduct>[])
          ListTile(
            key: ValueKey(p.id),
            contentPadding: EdgeInsets.zero,
            leading: ProductThumb(url: p.imageUrl, size: 36),
            title: Text(withCaption(productLabel(p.manufacturerName, p.name), p.caption)),
            subtitle: Align(
              alignment: AlignmentDirectional.centerStart,
              child: CategoryPill(p.category, dense: true),
            ),
            onTap: () => _pick(p),
          ),
        Align(
          alignment: AlignmentDirectional.centerStart,
          child: TextButton.icon(
            onPressed: () => setState(() {
              _newProduct = true;
              // What was searched for is the likeliest name.
              if (_productName.text.isEmpty) _productName.text = _search.text.trim();
            }),
            icon: const Icon(Icons.add),
            label: Text(l10n.deviceProductNew),
          ),
        ),
      ],
    );
  }

  List<Widget> _scanSection(S l10n) => [
    const SizedBox(height: 12),
    TextField(
      controller: _manualController,
      textInputAction: TextInputAction.done,
      decoration: InputDecoration(
        labelText: l10n.manualEntry,
        prefixIcon: const Icon(Icons.qr_code_scanner),
        helperText: l10n.deviceScanHint,
      ),
      onSubmitted: (_) => _submitManual(),
    ),
    ScanOutcomeBand(busy: _busy, last: _last, idle: l10n.scanNow),
  ];

  List<Widget> _untaggedSection(S l10n) => [
    const SizedBox(height: 12),
    Row(
      children: [
        Expanded(child: Text(l10n.deviceUntaggedCount)),
        IconButton(
          tooltip: l10n.countLess,
          onPressed: _busy || _count <= 1 ? null : () => setState(() => _count--),
          icon: const Icon(Icons.remove),
        ),
        SizedBox(
          width: 40,
          child: Text(
            '$_count',
            textAlign: TextAlign.center,
            style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 18),
          ),
        ),
        IconButton(
          tooltip: l10n.countMore,
          onPressed: _busy || _count >= _maxUntagged
              ? null
              : () => setState(() => _count++),
          icon: const Icon(Icons.add),
        ),
      ],
    ),
    const SizedBox(height: 8),
    FilledButton.icon(
      onPressed: _busy ? null : _registerUntagged,
      icon: const Icon(Icons.add_box_outlined),
      label: Text(l10n.deviceRegisterUntagged(_count)),
    ),
    if (_last != null || _busy) ScanOutcomeBand(busy: _busy, last: _last, idle: ''),
  ];
}
