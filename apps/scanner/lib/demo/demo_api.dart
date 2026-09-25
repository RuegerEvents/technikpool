import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';

import '../api/client.dart';
import '../api/generated/export.dart';
import 'demo_data.dart';

/// The base URL that means "this install is a demo".
///
/// It is stored in credentials exactly like a real server address, so the whole
/// app — pairing state, sign-out, the home screen — behaves as if paired
/// without knowing anything about demo mode. Not a resolvable scheme, so a
/// request that ever escapes the interceptor below fails loudly rather than
/// reaching somebody's network.
const demoBaseUrl = 'demo://technikpool';

bool isDemo(String? baseUrl) => baseUrl == demoBaseUrl;

/// A self-contained warehouse, for the app-store reviewers.
///
/// Apple and Google have to be able to work the app without a Technikpool
/// server to pair with, so this answers the API from memory. It intercepts at
/// the Dio layer rather than faking each screen: the generated clients, the
/// error envelopes and every screen behave exactly as they do against a real
/// server, so the demo can't drift from the app it is demonstrating.
///
/// Responses are built from the generated models and serialised with their own
/// `toJson`, so a change to `openapi.yaml` breaks this at compile time instead
/// of at review time.
class DemoBackend {
  /// [assets] overrides the fixture warehouse, so a test can build a case the
  /// demo itself shouldn't contain — two units sharing a serial number, say.
  DemoBackend({List<Asset>? assets}) : _assets = assets ?? DemoData.assets() {
    _seedStocktake();
  }

  final List<Asset> _assets;

  /// Which production each asset is currently out on, so a scan the reviewer
  /// performs is still there when they look the tag up again.
  final _checkedOutTo = <String, Production>{};
  final _history = <String, List<AssetTransaction>>{};

  /// Latency, because every screen has a loading state and an instant answer
  /// would leave those untested — and unseen.
  static const _latency = Duration(milliseconds: 220);

  Dio dio() {
    final dio = Dio(BaseOptions(baseUrl: demoBaseUrl));
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          await Future<void>.delayed(_latency);
          // resolve(..., true) so the response still runs through ApiClient's
          // own interceptor — that is what turns a 404 envelope into an
          // ApiException. Without it an error would reach Retrofit as a body to
          // deserialise, and the demo would fail where the real app copes.
          handler.resolve(_route(options), true);
        },
      ),
    );
    return dio;
  }

  Response<dynamic> _route(RequestOptions options) {
    final path = options.path;
    final method = options.method.toUpperCase();

    if (method == 'GET' && path == '/api/v1/me') {
      return _ok(options, DemoData.currentUser);
    }
    if (method == 'GET' && path == '/api/v1/locations') {
      return _ok(options, DemoData.locations);
    }
    if (method == 'GET' && path == '/api/v1/productions') {
      return _ok(options, DemoData.productions);
    }
    if (method == 'GET' && path == '/api/v1/categories') {
      return _ok(options, DemoData.categories);
    }
    if (method == 'GET' && path == '/api/v1/assets') {
      final unknownProduction = _rejectUnknownProduction(options);
      if (unknownProduction != null) return unknownProduction;
      return _ok(options, _listAssets(options));
    }
    if (method == 'GET' && path.startsWith('/api/v1/assets/by-tag/')) {
      return _byTag(options, Uri.decodeComponent(path.split('/').last));
    }
    if (method == 'POST' && path == '/api/v1/scans') {
      return _scan(options);
    }
    if (path == '/api/v1/stocktakes' || path.startsWith('/api/v1/stocktakes/')) {
      return _stocktakeRoute(options, method, path);
    }

    return _error(options, 404, 'not_found', 'Not available in the demo');
  }

  /// The server refuses a `productionId` naming nothing rather than answering
  /// an empty page, because listing a production's kit is a read of it. The
  /// demo user is a MEMBER of both fixture orgs, so the *forbidden* half of
  /// that rule can never fire here — only the 404 is reachable.
  Response<dynamic>? _rejectUnknownProduction(RequestOptions options) {
    final productionId = options.queryParameters['productionId'] as String?;
    if (productionId == null) return null;
    if (DemoData.productions.any((p) => p.id == productionId)) return null;
    return _error(
      options,
      404,
      'production_not_found',
      'Production "$productionId" not found',
    );
  }

  AssetPage _listAssets(RequestOptions options) {
    final query = options.queryParameters;
    final search = (query['q'] as String?)?.trim().toLowerCase();
    final categoryId = query['categoryId'] as String?;
    final locationId = query['locationId'] as String?;
    final productionId = query['productionId'] as String?;

    var matches = _assets.where((asset) {
      if (categoryId != null && asset.product.category.id != categoryId) return false;
      if (locationId != null && asset.location.id != locationId) return false;
      if (productionId != null && _checkedOutTo[asset.id]?.id != productionId) return false;
      if (search == null || search.isEmpty) return true;
      return '${asset.product.manufacturerName ?? ''} ${asset.product.name} '
              '${asset.assetTag ?? ''} ${asset.serialNumber ?? ''}'
          .toLowerCase()
          .contains(search);
    }).toList();

    // One page is plenty for a dozen assets, so the cursor is always null —
    // which is a valid last page, not a special case for the client.
    final limit = int.tryParse('${query['limit'] ?? ''}') ?? 50;
    if (matches.length > limit) matches = matches.sublist(0, limit);
    return AssetPage(items: matches, nextCursor: null);
  }

  Response<dynamic> _byTag(RequestOptions options, String tag) {
    final match = _resolve(tag);
    if (match.ambiguous) {
      return _error(
        options,
        409,
        'serial_ambiguous',
        'Serial number "$tag" is on more than one unit — scan the asset tag instead',
      );
    }
    final asset = match.asset;
    if (asset == null) {
      return _error(options, 404, 'asset_not_found', 'Tag "$tag" not found');
    }
    final detail = AssetDetail(
      id: asset.id,
      assetTag: asset.assetTag,
      serialNumber: asset.serialNumber,
      status: asset.status,
      product: asset.product,
      location: asset.location,
      organization: asset.organization,
      bundleId: asset.bundleId,
      parentAssetId: asset.parentAssetId,
      currentProduction: _checkedOutTo[asset.id],
      history: _history[asset.id] ?? const [],
    );
    return _ok(options, detail);
  }

  Response<dynamic> _scan(RequestOptions options) {
    // The body arrives as the model's own `toJson` map, before Dio would have
    // serialised it — so `targetType` is still an enum here, where a real
    // server would only ever see the string. Read it either way rather than
    // round-tripping through `fromJson`, which assumes the wire form.
    final body = options.data;
    if (body is! Map) {
      return _error(
        options,
        400,
        'invalid_request',
        'assetTag and target are required',
      );
    }
    final assetTag = '${body['assetTag'] ?? ''}'.trim();
    final targetId = '${body['targetId'] ?? ''}';
    final targetType = body['targetType'];
    final toProduction = targetType is ScanRequestTargetType
        ? targetType == ScanRequestTargetType.production
        : targetType == 'production';

    if (assetTag.isEmpty || targetId.isEmpty) {
      return _error(
        options,
        400,
        'invalid_request',
        'assetTag and target are required',
      );
    }

    final match = _resolve(assetTag);
    if (match.ambiguous) {
      return _error(
        options,
        409,
        'serial_ambiguous',
        'Serial number "$assetTag" is on more than one unit — scan the asset tag instead',
      );
    }
    final asset = match.asset;
    if (asset == null) {
      return _error(
        options,
        404,
        'asset_not_found',
        'Tag "$assetTag" not found',
      );
    }

    final scanned = ScannedAsset(
      id: asset.id,
      assetTag: asset.assetTag ?? assetTag,
      productName: asset.product.name,
      manufacturerName: asset.product.manufacturerName,
    );

    if (toProduction) {
      final production = DemoData.productions.firstWhere(
        (p) => p.id == targetId,
        orElse: () => DemoData.productions.first,
      );
      _checkedOutTo[asset.id] = production;
      _log(asset, 'CHECKED_OUT', production.name);
      return _ok(
        options,
        ScanResult(
          asset: scanned,
          action: ScanResultAction.checkedOut,
          targetName: production.name,
          returnedFrom: const [],
        ),
      );
    }

    final location = DemoData.locations.firstWhere(
      (l) => l.id == targetId,
      orElse: () => DemoData.locations.first,
    );
    // Putting kit back on a shelf returns it, exactly as the server does.
    final returned = _checkedOutTo.remove(asset.id);
    if (returned != null) _log(asset, 'RETURNED', returned.name);
    _moveTo(asset, location);
    _log(asset, 'LOCATION_ASSIGNED', location.name);

    return _ok(
      options,
      ScanResult(
        asset: scanned,
        action: ScanResultAction.locationAssigned,
        targetName: location.name,
        returnedFrom: returned == null ? const [] : [returned.name],
      ),
    );
  }

  /// Mirrors `resolveScannedCode` on the server: the printed tag wins outright,
  /// and a serial number resolves only when exactly one unit carries it. Kept in
  /// step deliberately — a demo that resolved codes differently would be
  /// demonstrating an app that doesn't exist.
  ({Asset? asset, bool ambiguous}) _resolve(String code) {
    final wanted = code.trim();
    if (wanted.isEmpty) return (asset: null, ambiguous: false);

    for (final asset in _assets) {
      if (asset.assetTag == wanted) return (asset: asset, ambiguous: false);
    }

    final lower = wanted.toLowerCase();
    final bySerial = _assets
        .where((a) => (a.serialNumber ?? '').toLowerCase() == lower)
        .toList();
    if (bySerial.length == 1) return (asset: bySerial.first, ambiguous: false);
    return (asset: null, ambiguous: bySerial.length > 1);
  }

  void _moveTo(Asset asset, Location location) {
    final index = _assets.indexOf(asset);
    if (index < 0) return;
    _assets[index] = Asset(
      id: asset.id,
      assetTag: asset.assetTag,
      serialNumber: asset.serialNumber,
      status: asset.status,
      product: asset.product,
      location: location,
      organization: asset.organization,
      bundleId: asset.bundleId,
      parentAssetId: asset.parentAssetId,
    );
  }

  void _log(Asset asset, String action, String targetName) {
    (_history[asset.id] ??= []).insert(
      0,
      AssetTransaction(
        id: 'astx_demo_${DateTime.now().microsecondsSinceEpoch}',
        action: action,
        createdAt: DateTime.now(),
        userName: DemoData.user.name,
        productionName: action == 'CHECKED_OUT' ? targetName : null,
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Stocktakes

  final _stocktakes = <String, _DemoStocktake>{};
  var _stocktakeSeq = 0;

  /// Untagged cables, so the counting half of a stocktake has something to
  /// count: the fixture's assets all carry tags, and a tag is scanned.
  static const _looseCable = Product(
    id: 'prd_demo_schuko',
    name: 'Schuko 5 m',
    manufacturerName: null,
    category: Category(
      id: 'catg_demo_light',
      name: 'Licht',
      color: '#facc15',
      sortOrder: 1,
    ),
  );

  void _seedStocktake() {
    final warehouse = DemoData.locations.first;
    final stocktake = _snapshot(
      name: 'Inventur ${warehouse.name}',
      organization: DemoData.nordlicht,
      locationIds: [warehouse.id],
      categoryIds: const [],
    );
    stocktake.lines.add((
      product: _looseCable,
      locationId: warehouse.id,
      expected: 20,
    ));
    _stocktakes[stocktake.id] = stocktake;
  }

  _DemoStocktake _snapshot({
    required String name,
    required Organization organization,
    required List<String> locationIds,
    required List<String> categoryIds,
  }) {
    final locations = DemoData.locations
        .where(
          (l) =>
              l.organization.id == organization.id &&
              (locationIds.isEmpty || locationIds.contains(l.id)),
        )
        .toList();
    final stocktake = _DemoStocktake(
      id: 'stk_demo_${++_stocktakeSeq}',
      name: name,
      organization: organization,
      locations: locations,
      locationScoped: locationIds.isNotEmpty,
    );
    for (final asset in _scopeAssets(organization.id, locationIds, categoryIds)) {
      stocktake.items[asset.id] = _DemoItem(
        asset: asset,
        expected: true,
        outAt: _checkedOutTo[asset.id]?.name,
      );
    }
    return stocktake;
  }

  Iterable<Asset> _scopeAssets(
    String orgId,
    List<String> locationIds,
    List<String> categoryIds,
  ) => _assets.where(
    (a) =>
        a.organization.id == orgId &&
        a.status != AssetStatus.sold &&
        a.status != AssetStatus.decommissioned &&
        (locationIds.isEmpty || locationIds.contains(a.location.id)) &&
        (categoryIds.isEmpty || categoryIds.contains(a.product.category.id)),
  );

  Response<dynamic> _stocktakeRoute(
    RequestOptions options,
    String method,
    String path,
  ) {
    // ['', 'api', 'v1', 'stocktakes', id?, sub?, assetId?]
    final parts = path.split('/');
    if (parts.length == 4) {
      if (method == 'GET') {
        final status = '${options.queryParameters['status'] ?? ''}';
        final list = _stocktakes.values
            .where(
              (s) =>
                  status.isEmpty ||
                  (status == 'OPEN' ? !s.closed : s.closed),
            )
            .map(_summary)
            .toList()
            .reversed
            .toList();
        return _ok(options, list);
      }
      if (method == 'POST') return _createStocktake(options);
    }
    if (parts.length == 5 && parts[4] == 'preview' && method == 'POST') {
      return _previewStocktake(options);
    }

    final stocktake = parts.length > 4 ? _stocktakes[parts[4]] : null;
    if (stocktake == null) {
      return _error(options, 404, 'stocktake_not_found', 'Stocktake not found');
    }
    if (parts.length == 5 && method == 'GET') {
      return _ok(options, _detail(stocktake));
    }
    if (stocktake.closed) {
      return _error(
        options,
        409,
        'stocktake_closed',
        'This stocktake is closed',
      );
    }

    final sub = parts.length > 5 ? parts[5] : '';
    final body = options.data is Map ? options.data as Map : const {};
    final locationId = '${body['locationId'] ?? ''}';

    if (sub == 'scans' && method == 'POST') {
      return _stocktakeScan(options, stocktake, '${body['code'] ?? ''}', locationId);
    }
    if (sub == 'ticks' && method == 'POST') {
      final ids = (body['assetIds'] as List? ?? const []).map((e) => '$e');
      var ticked = 0;
      var already = 0;
      for (final id in ids) {
        final asset = _assets.where((a) => a.id == id).firstOrNull;
        if (asset == null) continue;
        _tick(stocktake, asset, locationId) ? ticked++ : already++;
      }
      return _ok(
        options,
        StocktakeTickResult(ticked: ticked, alreadyFound: already),
      );
    }
    if (sub == 'items' && parts.length == 7) {
      final item = stocktake.items[parts[6]];
      if (item == null || !item.found) {
        return _error(
          options,
          409,
          'stocktake_not_found_yet',
          'This unit has not been counted',
        );
      }
      if (method == 'DELETE') {
        if (item.expected) {
          item
            ..foundLocationId = null
            ..note = null
            ..needsAttention = false;
        } else {
          stocktake.items.remove(parts[6]);
        }
        return _noContent(options);
      }
      if (method == 'PUT') {
        final note = '${body['note'] ?? ''}'.trim();
        item
          ..note = note.isEmpty ? null : note
          ..needsAttention = body['needsAttention'] == true;
        return _noContent(options);
      }
    }
    if (sub == 'counts' && method == 'PUT') {
      final productId = '${body['productId'] ?? ''}';
      final count = body['count'];
      if (!stocktake.lines.any((l) => l.product.id == productId)) {
        return _error(
          options,
          409,
          'stocktake_product_not_counted',
          'This product is not counted in this stocktake',
        );
      }
      if (count is! int || count < 0) {
        return _error(options, 400, 'invalid_request', 'Invalid count');
      }
      final previous = body['previous'];
      if (previous is int &&
          (stocktake.counts['$productId|$locationId'] ?? 0) != previous) {
        return _error(
          options,
          409,
          'stocktake_count_changed',
          'Your count here was changed elsewhere in the meantime',
        );
      }
      stocktake.counts['$productId|$locationId'] = count;
      return _noContent(options);
    }
    if (sub == 'close' && method == 'POST') {
      stocktake
        ..closed = true
        ..closedAt = DateTime.now();
      return _ok(options, _summary(stocktake));
    }
    return _error(options, 404, 'not_found', 'Not available in the demo');
  }

  ({String orgId, List<String> locationIds, List<String> categoryIds})
  _scopeOf(Map body) => (
    orgId: '${body['organizationId'] ?? ''}',
    locationIds: (body['locationIds'] as List? ?? const [])
        .map((e) => '$e')
        .toList(),
    categoryIds: (body['categoryIds'] as List? ?? const [])
        .map((e) => '$e')
        .toList(),
  );

  Response<dynamic> _previewStocktake(RequestOptions options) {
    final body = options.data is Map ? options.data as Map : const {};
    final scope = _scopeOf(body);
    final assets = _scopeAssets(
      scope.orgId,
      scope.locationIds,
      scope.categoryIds,
    ).toList();
    final overlaps = <StocktakeOverlap>[];
    for (final s in _stocktakes.values.where((s) => !s.closed)) {
      final shared = assets.where((a) => s.items[a.id]?.expected ?? false);
      if (shared.isNotEmpty) {
        overlaps.add(
          StocktakeOverlap(id: s.id, name: s.name, sharedUnits: shared.length),
        );
      }
    }
    final out = assets.where((a) => _checkedOutTo.containsKey(a.id)).length;
    return _ok(
      options,
      StocktakePreview(
        units: assets.length - out,
        looseUnits: 0,
        out: out,
        overlaps: overlaps,
      ),
    );
  }

  Response<dynamic> _createStocktake(RequestOptions options) {
    final body = options.data is Map ? options.data as Map : const {};
    final scope = _scopeOf(body);
    final organization = [
      DemoData.nordlicht,
      DemoData.buehnenwerk,
    ].where((o) => o.id == scope.orgId).firstOrNull;
    if (organization == null) {
      return _error(options, 403, 'forbidden', 'No access');
    }
    final name = '${body['name'] ?? ''}'.trim();
    final stocktake = _snapshot(
      name: name.isEmpty ? 'Inventur' : name,
      organization: organization,
      locationIds: scope.locationIds,
      categoryIds: scope.categoryIds,
    );
    if (stocktake.items.isEmpty) {
      return _error(
        options,
        409,
        'stocktake_empty',
        'Nothing matches this selection',
      );
    }
    _stocktakes[stocktake.id] = stocktake;
    return _ok(options, _summary(stocktake));
  }

  Response<dynamic> _stocktakeScan(
    RequestOptions options,
    _DemoStocktake stocktake,
    String code,
    String locationId,
  ) {
    if (!stocktake.locations.any((l) => l.id == locationId) &&
        !DemoData.locations.any(
          (l) =>
              l.id == locationId &&
              l.organization.id == stocktake.organization.id,
        )) {
      return _error(
        options,
        403,
        'wrong_organization',
        'Location belongs to a different organisation',
      );
    }
    final match = _resolve(code);
    if (match.ambiguous) {
      return _error(
        options,
        409,
        'serial_ambiguous',
        'Serial number "$code" is on more than one unit — scan the asset tag instead',
      );
    }
    final asset = match.asset;
    if (asset == null) {
      return _error(options, 404, 'asset_not_found', 'Tag "$code" not found');
    }

    if (!_tick(stocktake, asset, locationId)) {
      return _ok(
        options,
        StocktakeScanResult(
          outcome: StocktakeScanResultOutcome.already,
          item: _item(stocktake, stocktake.items[asset.id]!),
          alreadyFoundByName: DemoData.user.name,
          confirm: const [],
        ),
      );
    }
    final item = stocktake.items[asset.id]!;
    final accessories = _assets.where((a) => a.parentAssetId == asset.id);
    return _ok(
      options,
      StocktakeScanResult(
        outcome: item.expected
            ? StocktakeScanResultOutcome.found
            : StocktakeScanResultOutcome.unexpected,
        item: _item(stocktake, item),
        wasOutAt: item.outAt,
        confirm: [
          for (final a in accessories)
            StocktakeConfirmEntry(
              assetId: a.id,
              assetTag: a.assetTag,
              productName: a.product.name,
              manufacturerName: a.product.manufacturerName,
              foundByName: (stocktake.items[a.id]?.found ?? false)
                  ? DemoData.user.name
                  : null,
            ),
        ],
      ),
    );
  }

  /// Ticks one unit; false when it was counted already. A unit not on the list
  /// comes in as unexpected, with the server's reasons.
  bool _tick(_DemoStocktake stocktake, Asset asset, String locationId) {
    final existing = stocktake.items[asset.id];
    if (existing != null && existing.found) return false;
    final item =
        existing ??
        _DemoItem(
          asset: asset,
          expected: false,
          unexpectedReason: asset.organization.id != stocktake.organization.id
              ? 'other_org'
              : stocktake.locationScoped &&
                    !stocktake.locations.any((l) => l.id == asset.location.id)
              ? 'other_location'
              : 'out_of_scope',
        );
    item.foundLocationId = locationId;
    stocktake.items[asset.id] = item;
    return true;
  }

  String _state(_DemoStocktake stocktake, _DemoItem item) {
    if (!item.expected) return 'unexpected';
    if (item.found) return 'found';
    if (item.outAt != null) return 'out';
    return stocktake.closed ? 'missing' : 'open';
  }

  StocktakeLocation? _location(String? id) {
    final location = DemoData.locations.where((l) => l.id == id).firstOrNull;
    return location == null
        ? null
        : StocktakeLocation(id: location.id, name: location.name);
  }

  StocktakeItem _item(_DemoStocktake stocktake, _DemoItem item) {
    final asset = item.asset;
    return StocktakeItem(
      assetId: asset.id,
      assetTag: asset.assetTag,
      serialNumber: asset.serialNumber,
      productName: asset.product.name,
      manufacturerName: asset.product.manufacturerName,
      category: asset.product.category,
      cable: asset.product.cable,
      parentAssetId: asset.parentAssetId,
      state: StocktakeItemState.fromJson(_state(stocktake, item)),
      expectedLocation: item.expected ? _location(asset.location.id) : null,
      foundLocation: _location(item.foundLocationId),
      outAt: item.outAt,
      unexpectedReason: item.unexpectedReason,
      foundByName: item.found ? DemoData.user.name : null,
      foundByMe: item.found,
      note: item.note,
      needsAttention: item.needsAttention,
    );
  }

  List<StocktakeProductCount> _products(_DemoStocktake stocktake) {
    final byProduct = <String, List<({Product product, String locationId, int expected})>>{};
    for (final line in stocktake.lines) {
      (byProduct[line.product.id] ??= []).add(line);
    }
    return [
      for (final lines in byProduct.values)
        StocktakeProductCount(
          productId: lines.first.product.id,
          productName: lines.first.product.name,
          manufacturerName: lines.first.product.manufacturerName,
          category: lines.first.product.category,
          cable: lines.first.product.cable,
          expected: lines.fold(0, (n, l) => n + l.expected),
          out: 0,
          counted: stocktake.counts.entries
              .where((e) => e.key.startsWith('${lines.first.product.id}|'))
              .fold(0, (n, e) => n + e.value),
          locations: [
            for (final location in stocktake.locations)
              StocktakeLocationCount(
                location: StocktakeLocation(
                  id: location.id,
                  name: location.name,
                ),
                expected: lines
                    .where((l) => l.locationId == location.id)
                    .fold(0, (n, l) => n + l.expected),
                counted:
                    stocktake.counts['${lines.first.product.id}|${location.id}'] ??
                    0,
                myCount:
                    stocktake.counts['${lines.first.product.id}|${location.id}'],
              ),
          ],
        ),
    ];
  }

  StocktakeProgress _progress(_DemoStocktake stocktake) {
    final items = stocktake.items.values;
    final expected = items.where((i) => i.expected && i.outAt == null);
    var expectedLoose = 0;
    var countedLoose = 0;
    for (final p in _products(stocktake)) {
      expectedLoose += p.expected;
      countedLoose += p.counted < p.expected ? p.counted : p.expected;
    }
    return StocktakeProgress(
      expected: expected.length + expectedLoose,
      found: expected.where((i) => i.found).length + countedLoose,
      out: items.where((i) => i.expected && i.outAt != null && !i.found).length,
      unexpected: items.where((i) => !i.expected).length,
    );
  }

  StocktakeSummary _summary(_DemoStocktake stocktake) => StocktakeSummary(
    id: stocktake.id,
    name: stocktake.name,
    status: stocktake.closed
        ? StocktakeStatus.closed
        : StocktakeStatus.open,
    organization: stocktake.organization,
    createdAt: stocktake.createdAt,
    createdByName: DemoData.user.name ?? DemoData.user.email,
    closedAt: stocktake.closedAt,
    progress: _progress(stocktake),
    countingLocations: [
      for (final l in stocktake.locations)
        StocktakeLocation(id: l.id, name: l.name),
    ],
  );

  StocktakeDetail _detail(_DemoStocktake stocktake) {
    final summary = _summary(stocktake);
    return StocktakeDetail(
      id: summary.id,
      name: summary.name,
      status: summary.status,
      organization: summary.organization,
      createdAt: summary.createdAt,
      createdByName: summary.createdByName,
      closedAt: summary.closedAt,
      progress: summary.progress,
      countingLocations: summary.countingLocations,
      items: [
        for (final item in stocktake.items.values) _item(stocktake, item),
      ],
      products: _products(stocktake),
    );
  }

  Response<dynamic> _noContent(RequestOptions options) =>
      Response(requestOptions: options, statusCode: 204);

  /// A generated `toJson` is shallow — nested models come back as model
  /// instances, not maps — so serialise for real and decode it again. That is
  /// what a socket would have delivered, and it means `fromJson` on the other
  /// side is exercised exactly as it is against the server.
  Response<dynamic> _ok(RequestOptions options, Object model) => Response(
    requestOptions: options,
    statusCode: 200,
    data: jsonDecode(
      jsonEncode(model, toEncodable: (value) => (value as dynamic).toJson()),
    ),
  );

  Response<dynamic> _error(
    RequestOptions options,
    int status,
    String code,
    String message,
  ) => Response(
    requestOptions: options,
    statusCode: status,
    data: {
      'error': {'code': code, 'message': message},
    },
  );
}

/// A stocktake held in memory. One counter only — the demo user — so every
/// tick is "mine" and the per-counter counts collapse to one number each.
class _DemoStocktake {
  _DemoStocktake({
    required this.id,
    required this.name,
    required this.organization,
    required this.locations,
    required this.locationScoped,
  }) : createdAt = DateTime.now();

  final String id;
  final String name;
  final Organization organization;
  final List<Location> locations;

  /// Whether the scope named locations, which is what makes a unit elsewhere
  /// `other_location` rather than `out_of_scope` — as on the server.
  final bool locationScoped;
  final DateTime createdAt;
  bool closed = false;
  DateTime? closedAt;
  final items = <String, _DemoItem>{};

  /// Loose products: expected per product and location, and the one count.
  final lines = <({Product product, String locationId, int expected})>[];
  final counts = <String, int>{};
}

class _DemoItem {
  _DemoItem({
    required this.asset,
    required this.expected,
    this.outAt,
    this.unexpectedReason,
  });

  final Asset asset;
  final bool expected;
  final String? outAt;
  final String? unexpectedReason;
  String? foundLocationId;
  String? note;
  bool needsAttention = false;

  bool get found => foundLocationId != null;
}

/// An [ApiClient] wired to a [DemoBackend] instead of the network.
ApiClient demoApiClient(DemoBackend backend) =>
    ApiClient(baseUrl: demoBaseUrl, dio: backend.dio());
