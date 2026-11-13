import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart' show RenderProxyBox;
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/client.dart';
import '../api/generated/export.dart';
import '../cable_colors.dart';
import '../cable_format.dart';
import '../demo/demo_data.dart';
import '../inventory_rows.dart';
import '../l10n/generated/app_localizations.dart';
import '../l10n/labels.dart';
import '../product_label.dart';
import '../scan/camera_scan_screen.dart';
import '../scan/scan_tones.dart';
import '../state/providers.dart';
import '../widgets/cable_color_dot.dart';
import '../widgets/category_pill.dart';
import '../widgets/product_thumb.dart';
import 'asset_detail_screen.dart';
import 'bundle_screen.dart';
import 'product_units_screen.dart';

/// Browse what's where — grouped as on the web's Devices page: kits beside
/// the loose products, every product, or every unit — and look a code up:
/// while this tab is in front, a scan (or a tag typed into the search and
/// submitted) opens what it is, the way the old Lookup tab did. Read-only:
/// a row or a scan opens what it is, and nothing here changes stock.
class InventoryScreen extends ConsumerStatefulWidget {
  const InventoryScreen({super.key});

  @override
  ConsumerState<InventoryScreen> createState() => _InventoryScreenState();
}

class _InventoryScreenState extends ConsumerState<InventoryScreen> {
  static const _debounceFor = Duration(milliseconds: 250);

  String? _locationId;
  String? _categoryId;

  /// The cable colour schemes, as of the last build. Kept here because the
  /// rows are built lazily, outside build, where nothing may be watched.
  CableColors _cableColors = CableColors.empty;
  String _query = '';
  Timer? _debounce;

  /// The unit list, a page at a time.
  final _assets = <Asset>[];
  String? _cursor;
  bool _exhausted = false;

  /// Units by product and organization, counted by the server — every unit
  /// for "All products", only those in no kit for the bundle view.
  List<InventoryProduct>? _counts;

  bool _loading = false;
  String? _error;

  /// Only the newest load may land: filters change faster than the reads.
  int _seq = 0;

  final _search = TextEditingController();
  StreamSubscription<String>? _sub;

  /// One code looked up at a time; a scan while one is open waits its turn.
  Future<void> _queue = Future<void>.value();
  bool _resolving = false;

  /// Set while this tab's own camera is up, whose scans are this tab's even
  /// though its route is not the one in front. Held a moment past closing:
  /// the camera pops itself as it hands the code over.
  bool _cameraOpen = false;

  /// The grouping, search and filters: three rows a PDA can ill spare, so
  /// they scroll away with the list, pixel for pixel, and come back the same
  /// way on a move up. They float over the list, whose top padding is their
  /// height — resizing the list instead would move its rows twice as fast as
  /// the finger and clip the top one.
  double _headerHeight = 0;

  /// How much of the header is pushed up out of sight.
  double _headerHidden = 0;

  InventoryGrouping get _grouping =>
      ref.read(inventoryGroupingProvider).value ?? InventoryGrouping.bundles;

  @override
  void initState() {
    super.initState();
    ref.read(inventoryGroupingProvider.future).then((_) {
      if (mounted) _load(reset: true);
    });
    _sub = ref.read(scanBusProvider).codes.listen(_onScan);
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _sub?.cancel();
    _search.dispose();
    super.dispose();
  }

  // ---------------------------------------------------------------------------
  // Looking a code up

  void _onScan(String raw) {
    final code = raw.trim();
    // Every tab stays mounted inside the IndexedStack, so this hears scans
    // meant for a session too: only the tab in front reacts, and only while
    // nothing is open over it — a unit, a kit, the "+" — but its own camera.
    if (code.isEmpty || !mounted) return;
    if (ref.read(activeTabProvider) != HomeTab.inventory) return;
    if (!(ModalRoute.of(context)?.isCurrent ?? true) && !_cameraOpen) return;
    _queue = _queue.then((_) => _resolve(code, fromScan: true));
  }

  /// Opens what [code] is: a unit (by tag or a serial number only one unit
  /// carries), else a kit by its own sticker. Says why not after a scan; a
  /// submitted search that names nothing just stays a search. Returns
  /// whether something opened.
  Future<bool> _resolve(String code, {required bool fromScan}) async {
    final api = ref.read(apiClientProvider);
    if (api == null || !mounted) return false;
    // Read before the first await — see SessionScreen._submit.
    final l10n = S.of(context);
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _resolving = true);
    try {
      final asset = await api.inventory.getAssetByTag(tag: code);
      if (!mounted) return true;
      unawaited(
        _open(
          AssetDetailScreen(
            assetId: asset.id,
            title: asset.assetTag ?? code,
            initial: asset,
          ),
        ),
      );
      return true;
    } catch (error) {
      // No unit carries the code — it may be a kit's own sticker.
      if (unwrapError(error) case ApiException(code: 'asset_not_found')) {
        final kit = await _kitWithTag(api, code);
        if (kit != null && mounted) {
          unawaited(_open(BundleScreen(bundleId: kit.id, name: kit.name)));
          return true;
        }
      }
      if (fromScan && mounted) {
        // A hit is read off the screen anyway; only a miss makes a sound.
        ref.scanTone(ScanTone.error);
        messenger
          ..hideCurrentSnackBar()
          ..showSnackBar(
            SnackBar(content: Text('$code · ${describeError(l10n, error)}')),
          );
      }
      return false;
    } finally {
      if (mounted) setState(() => _resolving = false);
    }
  }

  /// The kit whose own sticker [code] is, if it is one — what the case check
  /// resolves codes with.
  Future<({String id, String name})?> _kitWithTag(
    ApiClient api,
    String code,
  ) async {
    try {
      final found = await api.caseCheck.getCaseCheckByCode(code: code);
      if (found.kind != CaseKind.bundle || found.scannedAssetId != null) {
        return null;
      }
      return (id: found.id, name: found.name);
    } catch (_) {
      return null;
    }
  }

  Future<void> _openCamera() async {
    setState(() => _cameraOpen = true);
    await CameraScanScreen.once(context, title: S.of(context).inventory);
    await Future<void>.delayed(const Duration(milliseconds: 500));
    if (mounted) setState(() => _cameraOpen = false);
  }

  /// Moves the filters by exactly as far as the list scrolled. Never more
  /// than the list has scrolled from its top, since the space they leave is
  /// the list's own padding: back at the top they are always fully there.
  bool _onListScroll(Notification n) {
    final ScrollMetrics metrics;
    var hidden = _headerHidden;
    if (n is ScrollUpdateNotification && n.depth == 0) {
      metrics = n.metrics;
      hidden += n.scrollDelta ?? 0;
    } else if (n is ScrollMetricsNotification && n.depth == 0) {
      // The list was replaced or its rows changed under a still finger.
      metrics = n.metrics;
    } else {
      return false;
    }
    if (metrics.axis != Axis.vertical) return false;
    final scrolled = math.max(0.0, metrics.pixels - metrics.minScrollExtent);
    hidden = hidden.clamp(0.0, math.min(_headerHeight, scrolled));
    if (hidden != _headerHidden) setState(() => _headerHidden = hidden);
    return false;
  }

  void _headerMeasured(double height) {
    if (!mounted || height == _headerHeight) return;
    setState(() {
      _headerHeight = height;
      _headerHidden = math.min(_headerHidden, height);
    });
  }

  Future<void> _load({bool reset = false}) async {
    if (!reset && _loading) return;
    final api = ref.read(apiClientProvider);
    if (api == null) return;
    final l10n = S.of(context);
    final seq = reset ? ++_seq : _seq;

    setState(() {
      _loading = true;
      _error = null;
      if (reset) {
        _assets.clear();
        _cursor = null;
        _exhausted = false;
        _counts = null;
      }
    });

    try {
      if (_grouping == InventoryGrouping.devices) {
        final page = await _page(api, 50, _cursor);
        if (!mounted || seq != _seq) return;
        setState(() {
          _assets.addAll(page.items);
          _cursor = page.nextCursor;
          _exhausted = page.nextCursor == null;
        });
      } else {
        final counts = await api.inventory.listInventoryProducts(
          q: _query.isEmpty ? null : _query,
          locationId: _locationId,
          categoryId: _categoryId,
          looseOnly: _grouping == InventoryGrouping.bundles,
        );
        if (!mounted || seq != _seq) return;
        setState(() => _counts = counts);
      }
    } catch (error) {
      if (mounted && seq == _seq) {
        setState(() => _error = describeError(l10n, error));
      }
    } finally {
      if (mounted && seq == _seq) setState(() => _loading = false);
    }
  }

  Future<AssetPage> _page(ApiClient api, int limit, String? cursor) =>
      api.inventory.listAssets(
        limit: limit,
        locationId: _locationId,
        categoryId: _categoryId,
        q: _query.isEmpty ? null : _query,
        cursor: cursor,
      );

  void _searchChanged(String value) {
    _debounce?.cancel();
    _debounce = Timer(_debounceFor, () {
      if (!mounted || value.trim() == _query) return;
      _query = value.trim();
      _load(reset: true);
    });
  }

  void _pickGrouping(InventoryGrouping grouping) {
    // The notifier takes the new value at once and stores it after, so the
    // load below already reads it.
    ref.read(inventoryGroupingProvider.notifier).save(grouping);
    _load(reset: true);
  }

  /// Opens a row's screen; the counts are read again on the way back, since
  /// a kit or a product's units may have changed there.
  Future<void> _open(Widget screen) async {
    await Navigator.of(context)
        .push<void>(MaterialPageRoute(builder: (_) => screen));
    if (mounted) unawaited(_load(reset: true));
  }

  @override
  Widget build(BuildContext context) {
    final l10n = S.of(context);
    // Units registered elsewhere — the "+" on the home screen — are not in
    // the pages in hand, so the list starts over.
    ref.listen(unitsChangedProvider, (_, _) => _load(reset: true));
    _cableColors = ref.watch(cableColorLookupProvider);
    final grouping =
        ref.watch(inventoryGroupingProvider).value ?? InventoryGrouping.bundles;
    final locations = ref.watch(locationsProvider).value ?? const <Location>[];
    final categories =
        ref.watch(categoriesProvider).value ?? const <Category>[];

    return Scaffold(
      // HomeScreen's Scaffold owns the keyboard inset for every tab.
      resizeToAvoidBottomInset: false,
      appBar: AppBar(
        title: Text(l10n.inventory),
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
          if (_loading || _resolving)
            const LinearProgressIndicator()
          else
            const SizedBox(height: 4),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.all(16),
              child: Text(
                _error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ),
          Expanded(
            child: Stack(
              children: [
                NotificationListener<Notification>(
                  onNotification: _onListScroll,
                  child: RefreshIndicator(
                    // Pulled down only at the top, where the header is all
                    // there: the spinner comes out from under it.
                    edgeOffset: _headerHeight,
                    onRefresh: () async {
                      ref.invalidate(bundlesProvider);
                      await _load(reset: true);
                    },
                    child: switch (grouping) {
                      InventoryGrouping.devices => _devices(l10n),
                      InventoryGrouping.products => _products(l10n),
                      InventoryGrouping.bundles => _bundleView(
                        l10n,
                        categories,
                      ),
                    },
                  ),
                ),
                // Kept mounted while out of sight, so the search keeps its
                // text and the filters their choice.
                Positioned(
                  top: -_headerHidden,
                  left: 0,
                  right: 0,
                  child: _HeightReporter(
                    onHeight: _headerMeasured,
                    child: ColoredBox(
                      color: Theme.of(context).scaffoldBackgroundColor,
                      child: Padding(
                        padding: const EdgeInsets.only(bottom: 4),
                        child: _header(l10n, grouping, locations, categories),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _header(
    S l10n,
    InventoryGrouping grouping,
    List<Location> locations,
    List<Category> categories,
  ) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
          child: SizedBox(
            width: double.infinity,
            child: SegmentedButton<InventoryGrouping>(
              showSelectedIcon: false,
              style: const ButtonStyle(
                padding: WidgetStatePropertyAll(
                  EdgeInsets.symmetric(horizontal: 4, vertical: 6),
                ),
              ),
              segments: [
                ButtonSegment(
                  value: InventoryGrouping.bundles,
                  label: Text(l10n.inventoryBundleView),
                ),
                ButtonSegment(
                  value: InventoryGrouping.products,
                  label: Text(l10n.inventoryAllProducts),
                ),
                ButtonSegment(
                  value: InventoryGrouping.devices,
                  label: Text(l10n.inventoryAllDevices),
                ),
              ],
              selected: {grouping},
              onSelectionChanged: (picked) => _pickGrouping(picked.first),
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
          child: TextField(
            controller: _search,
            decoration: InputDecoration(
              labelText: l10n.inventorySearch,
              prefixIcon: const Icon(Icons.search),
              isDense: true,
              // The demo has no sticker to point at, so a tag to type has to
              // be on screen.
              helperText: ref.watch(isDemoProvider)
                  ? l10n.demoTagHint(DemoData.assets().first.assetTag!)
                  : null,
            ),
            textInputAction: TextInputAction.search,
            onChanged: _searchChanged,
            onSubmitted: (v) {
              _debounce?.cancel();
              final text = v.trim();
              _query = text;
              _load(reset: true);
              // A tag or serial number typed in opens its unit, as a scan
              // would; anything else stays a search. Not through the scan
              // bus: a retyped tag is meant, and the bus would drop it as
              // an echo.
              if (text.isNotEmpty && !text.contains(' ')) {
                _queue = _queue.then((_) => _resolve(text, fromScan: false));
              }
            },
          ),
        ),
        // Side by side rather than stacked: a third full-width row would eat
        // most of a PDA screen before a single result showed.
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
          child: Row(
            spacing: 8,
            children: [
              Expanded(
                child: DropdownButtonFormField<String?>(
                  initialValue: _locationId,
                  isExpanded: true,
                  decoration: InputDecoration(
                    labelText: l10n.filterByLocation,
                    isDense: true,
                  ),
                  items: [
                    DropdownMenuItem(value: null, child: Text(l10n.all)),
                    for (final loc in locations)
                      DropdownMenuItem(
                        value: loc.id,
                        child: Text(loc.name, overflow: TextOverflow.ellipsis),
                      ),
                  ],
                  onChanged: (v) {
                    _locationId = v;
                    _load(reset: true);
                  },
                ),
              ),
              Expanded(
                child: DropdownButtonFormField<String?>(
                  initialValue: _categoryId,
                  isExpanded: true,
                  decoration: InputDecoration(
                    labelText: l10n.filterByCategory,
                    isDense: true,
                  ),
                  items: [
                    DropdownMenuItem(value: null, child: Text(l10n.all)),
                    for (final category in categories)
                      DropdownMenuItem(
                        value: category.id,
                        child: Text(
                          category.name,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                  ],
                  onChanged: (v) {
                    _categoryId = v;
                    _load(reset: true);
                  },
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  /// A list that also says when it is empty — once something has been read.
  Widget _list(S l10n, int count, Widget Function(int) row, {Widget? tail}) {
    if (count == 0 && !_loading && _error == null) {
      return ListView(
        padding: EdgeInsets.only(top: _headerHeight),
        children: [
          Padding(
            padding: const EdgeInsets.all(24),
            child: Text(
              l10n.noResults,
              textAlign: TextAlign.center,
              style: TextStyle(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
          ),
        ],
      );
    }
    return ListView.separated(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      // Clear of the "+" floating over the list's end.
      padding: EdgeInsets.only(top: _headerHeight, bottom: 88),
      itemCount: count + (tail == null ? 0 : 1),
      separatorBuilder: (_, _) => const Divider(height: 1),
      itemBuilder: (_, i) => i == count ? tail! : row(i),
    );
  }

  Widget _devices(S l10n) {
    final kits = {
      for (final kit
          in ref.watch(bundlesProvider('')).value ?? const <BundleSummary>[])
        kit.id: kit.name,
    };
    final Widget tail = _exhausted
        ? const SizedBox(height: 24)
        : _loading
        ? const SizedBox.shrink()
        : Padding(
            padding: const EdgeInsets.all(16),
            child: OutlinedButton(onPressed: _load, child: Text(l10n.loadMore)),
          );
    return _list(l10n, _assets.length, (i) {
      final asset = _assets[i];
      final tag = asset.assetTag;
      return ListTile(
        leading: ProductThumb(url: asset.product.imageUrl, size: 40),
        // Its detail, as a scan of it in Lookup would show — by id, so a unit
        // without a tag opens as well.
        onTap: () => _open(
          AssetDetailScreen(
            assetId: asset.id,
            title: tag ?? '#${asset.orgIndex ?? '—'}',
          ),
        ),
        title: Text(
          withCaption(
            productLabel(asset.product.manufacturerName, asset.product.name),
            asset.product.caption,
          ),
          style: const TextStyle(fontWeight: FontWeight.w600),
        ),
        subtitle: Padding(
          padding: const EdgeInsets.only(top: 3),
          child: Row(
            spacing: 8,
            children: [
              CategoryPill(asset.product.category, dense: true),
              if (_cableColors.colorFor(
                    asset.organization.id,
                    asset.product.cable?.lengthCm,
                  )
                  case final color?)
                CableColorDot(color),
              Expanded(
                child: Text(
                  [
                    tag ?? '#${asset.orgIndex ?? '—'}',
                    asset.location.name,
                    if (asset.status != AssetStatus.available)
                      Labels.assetStatus(l10n, asset.status),
                    if (kits[asset.bundleId] case final kit?)
                      '${l10n.lookupKit} $kit',
                    // Two cables of one type differ only by length and ends,
                    // so a tile without them is unusable for telling them
                    // apart.
                    if (asset.product.cable case final cable?) ...[
                      cableConnectors(cable),
                      ?cableLength(cable, l10n.localeName),
                    ],
                  ].join(' · '),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
        ),
      );
    }, tail: _assets.isEmpty ? null : tail);
  }

  Widget _products(S l10n) {
    final rows = [
      for (final counts in _counts ?? const <InventoryProduct>[])
        ProductRow(counts),
    ];
    final orgs = {for (final r in rows) r.counts.organizationId}.length;
    return _list(l10n, rows.length, (i) => _productTile(l10n, rows[i], orgs));
  }

  Widget _bundleView(S l10n, List<Category> categories) {
    final category = categories.where((c) => c.id == _categoryId).firstOrNull;
    final kitsAsync = ref.watch(bundlesProvider(_query));
    final kits = (kitsAsync.value ?? const <BundleSummary>[])
        .where(
          (k) =>
              (_locationId == null || k.location?.id == _locationId) &&
              (category == null || k.categoryName == category.name),
        )
        .toList();
    final rows = _counts == null
        ? const <InventoryRow>[]
        : bundleViewRows(_counts!, kits);
    final orgs = {
      for (final r in rows)
        if (r is ProductInventoryRow) r.row.counts.organizationId,
    }.length;
    return _list(
      l10n,
      rows.length,
      (i) => switch (rows[i]) {
        KitInventoryRow(:final kit) => _kitTile(l10n, kit),
        ProductInventoryRow(:final row) => _productTile(l10n, row, orgs),
      },
    );
  }

  /// The organization a counted row is of, as the product's units screen
  /// takes it — from the user's memberships, which carry its colour and
  /// label; a system admin's view of another org gets a plain one.
  Organization _organization(InventoryProduct counts) {
    final orgs =
        ref.read(currentUserProvider).value?.organizations ??
        const <MemberOrganization>[];
    final member = orgs.where((o) => o.id == counts.organizationId).firstOrNull;
    return Organization(
      id: counts.organizationId,
      name: member?.name ?? counts.organizationName,
      shortName: member?.shortName,
      color: member?.color ?? '#ffffff',
      avatarLabel: member?.avatarLabel ?? '',
    );
  }

  Widget _kitTile(S l10n, BundleSummary kit) => ListTile(
    leading: ProductThumb(url: kit.imageUrl, size: 40),
    onTap: () => _open(BundleScreen(bundleId: kit.id, name: kit.name)),
    title: Text(
      withCaption(kit.name, kit.caption),
      style: const TextStyle(fontWeight: FontWeight.w600),
    ),
    subtitle: Text(
      [
        l10n.lookupKit,
        ?kit.tag,
        l10n.bundleUnitCount(kit.unitCount),
        ?kit.location?.name,
      ].join(' · '),
      overflow: TextOverflow.ellipsis,
    ),
    trailing: const Icon(Icons.inventory_2_outlined),
  );

  /// [orgs] is how many organizations the list spans: only then does a row
  /// say whose units it counts.
  Widget _productTile(S l10n, ProductRow row, int orgs) => ListTile(
    leading: ProductThumb(url: row.product.imageUrl, size: 40),
    onTap: () => _open(
      ProductUnitsScreen(
        product: row.product,
        organization: _organization(row.counts),
        locationId: _locationId,
      ),
    ),
    title: Text(
      withCaption(row.name, row.product.caption),
      style: const TextStyle(fontWeight: FontWeight.w600),
    ),
    subtitle: Padding(
      padding: const EdgeInsets.only(top: 3),
      child: Row(
        spacing: 8,
        children: [
          CategoryPill(row.product.category, dense: true),
          if (_cableColors.colorFor(
                row.counts.organizationId,
                row.product.cable?.lengthCm,
              )
              case final color?)
            CableColorDot(color),
          Expanded(
            child: Text(
              [
                l10n.bundleUnitCount(row.counts.count),
                if (orgs > 1) row.counts.organizationName,
                if (row.product.cable case final cable?) ...[
                  cableConnectors(cable),
                  ?cableLength(cable, l10n.localeName),
                ],
              ].join(' · '),
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    ),
  );
}

/// Hands its child's height to [onHeight] after each layout that changed it —
/// the header's, which the list below needs as its top padding and which
/// grows by a line when the demo's tag hint shows.
class _HeightReporter extends SingleChildRenderObjectWidget {
  const _HeightReporter({required this.onHeight, required super.child});

  final ValueChanged<double> onHeight;

  @override
  RenderObject createRenderObject(BuildContext context) =>
      _RenderHeightReporter(onHeight);

  @override
  void updateRenderObject(
    BuildContext context,
    _RenderHeightReporter renderObject,
  ) => renderObject.onHeight = onHeight;
}

class _RenderHeightReporter extends RenderProxyBox {
  _RenderHeightReporter(this.onHeight);

  ValueChanged<double> onHeight;
  double? _reported;

  @override
  void performLayout() {
    super.performLayout();
    final height = size.height;
    if (height == _reported) return;
    _reported = height;
    // Layout is no place for a setState.
    WidgetsBinding.instance.addPostFrameCallback((_) => onHeight(height));
  }
}
