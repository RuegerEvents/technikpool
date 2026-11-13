import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';

import '../api/client.dart';
import '../api/generated/export.dart';
import '../natural_sort.dart';
import '../product_label.dart';
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
    _seedInspections();
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
    // A demo has no operator, so there is nothing of theirs to link.
    if (method == 'GET' && path == '/api/v1/legal') {
      return _ok(options, <Object>[]);
    }
    if (method == 'GET' && path == '/api/v1/cable-colors') {
      return _ok(options, DemoData.cableColors);
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
    if (method == 'POST' && path == '/api/v1/assets') {
      return _createAsset(options);
    }
    if (method == 'PUT' && path.startsWith('/api/v1/assets/') && path.endsWith('/tag')) {
      return _setTag(options, Uri.decodeComponent(path.split('/')[4]));
    }
    if (method == 'POST' && path == '/api/v1/assets/untagged') {
      return _createUntagged(options);
    }
    if (method == 'GET' && path == '/api/v1/products') {
      return _ok(options, _listCatalog(options.queryParameters));
    }
    if (method == 'POST' && path == '/api/v1/products') {
      return _createProduct(options);
    }
    // ['', 'api', 'v1', 'products', id]
    if (path.startsWith('/api/v1/products/') && path.split('/').length == 5) {
      final id = Uri.decodeComponent(path.split('/').last);
      final product = _catalogue.where((p) => p.id == id).firstOrNull;
      if (product == null) {
        return _error(options, 404, 'product_not_found', 'Product not found');
      }
      if (method == 'GET') return _ok(options, _catalogProduct(product));
      if (method == 'PATCH') return _updateProduct(options, product);
    }
    if (method == 'GET' && path == '/api/v1/manufacturers') {
      return _ok(options, _manufacturers());
    }
    if (method == 'GET' && path.startsWith('/api/v1/assets/by-tag/')) {
      return _byTag(options, Uri.decodeComponent(path.split('/').last));
    }
    // ['', 'api', 'v1', 'assets', id]
    if (method == 'GET' && path.startsWith('/api/v1/assets/') && path.split('/').length == 5) {
      final id = Uri.decodeComponent(path.split('/').last);
      final asset = _units.where((a) => a.id == id).firstOrNull;
      if (asset == null) {
        return _error(options, 404, 'asset_not_found', 'Unit not found');
      }
      return _ok(options, _assetDetail(asset));
    }
    if (method == 'GET' && path == '/api/v1/inventory/products') {
      return _ok(options, _inventoryProducts(options.queryParameters));
    }
    if (method == 'POST' && path == '/api/v1/scans') {
      return _scan(options);
    }
    if (path == '/api/v1/stocktakes' || path.startsWith('/api/v1/stocktakes/')) {
      return _stocktakeRoute(options, method, path);
    }
    if (method == 'GET' && path.startsWith('/api/v1/case-checks/by-code/')) {
      return _openCase(options, Uri.decodeComponent(path.split('/').last));
    }
    // ['', 'api', 'v1', 'case-checks', kind, id, 'label']
    if (method == 'GET' && path.startsWith('/api/v1/case-checks/') && path.endsWith('/label')) {
      final segments = path.split('/');
      return _caseLabel(options, CaseKind.fromJson(segments[4]), segments[5]);
    }
    if (method == 'POST' && path == '/api/v1/case-checks') {
      return _recordCase(options);
    }
    // ['', 'api', 'v1', 'case-checks', kind, id, 'scans']
    if (method == 'POST' && path.startsWith('/api/v1/case-checks/') && path.endsWith('/scans')) {
      final segments = path.split('/');
      return _scanIntoCase(options, CaseKind.fromJson(segments[4]), segments[5]);
    }
    if (method == 'POST' &&
        path.startsWith('/api/v1/productions/') &&
        path.endsWith('/checks')) {
      return _startCheck(options, path.split('/')[4]);
    }
    if (path.startsWith('/api/v1/production-checks/')) {
      return _checkRoute(options, method, path);
    }
    // ['', 'api', 'v1', 'productions', id, 'handout', mode, sub?]
    final segments = path.split('/');
    // ['', 'api', 'v1', 'productions', id, 'packing', caseAssetId?, 'label'?]
    if (segments.length >= 6 && segments[3] == 'productions' && segments[5] == 'packing') {
      return _packingRoute(options, method, segments);
    }
    if (segments.length >= 7 && segments[3] == 'productions' && segments[5] == 'handout') {
      return _handoutRoute(options, method, segments);
    }
    if (path == '/api/v1/bundles' || path.startsWith('/api/v1/bundles/')) {
      return _bundleRoute(options, method, path);
    }
    if (method == 'GET' && path == '/api/v1/inspection-types') {
      return _ok(options, _inspectionTypes);
    }
    if (method == 'POST' && path == '/api/v1/defects') {
      return _reportDefect(options);
    }
    if (method == 'POST' && path == '/api/v1/inspections') {
      return _recordInspection(options);
    }
    if (method == 'DELETE' && path.startsWith('/api/v1/inspections/')) {
      return _deleteInspection(options, Uri.decodeComponent(path.split('/').last));
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
    final productId = query['productId'] as String?;

    // Every unit, the untagged cables included: the Inventory tab counts
    // them by product, and a drawer of cables is stock like any other.
    var matches = _units.where((asset) {
      if (productId != null && asset.product.id != productId) return false;
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
    return _ok(options, _assetDetail(asset));
  }

  /// What a unit's lookup answers, by tag or by id alike.
  AssetDetail _assetDetail(Asset asset) {
    return AssetDetail(
      id: asset.id,
      assetTag: asset.assetTag,
      serialNumber: asset.serialNumber,
      orgIndex: asset.orgIndex,
      status: asset.status,
      product: asset.product,
      location: asset.location,
      organization: asset.organization,
      bundleId: asset.bundleId,
      parentAssetId: asset.parentAssetId,
      currentProduction: _checkedOutTo[asset.id],
      history: _history[asset.id] ?? const [],
      inspectionIntervalMonths: _intervalOf(asset),
      nextInspectionDue: _inspectionDue(asset),
      inspections: _inspectionsOf(asset).take(10).toList(),
    );
  }

  /// Mirrors `listInventoryProducts`: the units by product and organization,
  /// counted here, only rows with any, by product name. With `looseOnly` a
  /// unit in a kit is left out — its kit is the row it is on.
  List<InventoryProduct> _inventoryProducts(Map<String, dynamic> query) {
    final q = '${query['q'] ?? ''}'.trim();
    final orgId = query['organizationId'] as String?;
    final locationId = query['locationId'] as String?;
    final categoryId = query['categoryId'] as String?;
    final looseOnly = '${query['looseOnly']}' == 'true';
    final groups = <String, List<Asset>>{};
    for (final a in _units) {
      if (a.status == AssetStatus.sold || a.status == AssetStatus.decommissioned) continue;
      if (orgId != null && a.organization.id != orgId) continue;
      if (locationId != null && a.location.id != locationId) continue;
      if (categoryId != null && a.product.category.id != categoryId) continue;
      if (looseOnly && a.bundleId != null) continue;
      if (q.isNotEmpty && !_matches(a.product, q)) continue;
      groups.putIfAbsent('${a.product.id}|${a.organization.id}', () => []).add(a);
    }
    return [
      for (final units in groups.values)
        InventoryProduct(
          product: units.first.product,
          organizationId: units.first.organization.id,
          organizationName: units.first.organization.name,
          count: units.length,
          available: units
              .where((u) => u.status == AssetStatus.available && !_checkedOutTo.containsKey(u.id))
              .length,
          untagged: units.where((u) => u.assetTag == null).length,
        ),
    ]..sort((a, b) => naturalCompare(a.product.name, b.product.name));
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
      productCaption: asset.product.caption,
      manufacturerName: asset.product.manufacturerName,
      ownerOrgId: asset.organization.id,
      lengthCm: asset.product.cable?.lengthCm,
    );

    if (toProduction) {
      final production = DemoData.productions.firstWhere(
        (p) => p.id == targetId,
        orElse: () => DemoData.productions.first,
      );
      _checkedOutTo[asset.id] = production;
      // Going out again starts a new handover; the demo user stands on both
      // sides, so it is received at once — as the server does for them.
      _returnReported.remove(asset.id);
      if (asset.organization.id != production.organization.id) _received.add(asset.id);
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

  void _moveTo(Asset asset, Location location) => _replace(asset, location: location);

  /// The generated models are immutable, so a changed unit is a new one in
  /// its old place. Returns it, or [asset] itself if it isn't in the fixture.
  Asset _replace(Asset asset, {Location? location, AssetStatus? status}) {
    final index = _assets.indexWhere((a) => a.id == asset.id);
    if (index < 0) return asset;
    return _assets[index] = Asset(
      id: asset.id,
      assetTag: asset.assetTag,
      serialNumber: asset.serialNumber,
      orgIndex: asset.orgIndex,
      status: status ?? asset.status,
      product: asset.product,
      location: location ?? asset.location,
      organization: asset.organization,
      bundleId: asset.bundleId,
      parentAssetId: asset.parentAssetId,
    );
  }

  void _log(
    Asset asset,
    String action,
    String targetName, {
    TransactionInspection? inspection,
    TransactionSwap? swap,
  }) {
    (_history[asset.id] ??= []).insert(
      0,
      AssetTransaction(
        id: 'astx_demo_${DateTime.now().microsecondsSinceEpoch}',
        action: action,
        createdAt: DateTime.now(),
        userName: DemoData.user.name,
        productionName: action == 'CHECKED_OUT' ? targetName : null,
        inspection: inspection,
        swap: swap,
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Swapping linked units — mirrors services/unit-swap.ts. A unit of the same
  // product and org as one linked in a kit or on a unit takes its place, and
  // that one takes the scanned one's old place, or becomes loose. The demo has
  // no production dates, so there are no booking clashes to weigh.

  /// The first of [candidates] the scanned unit may take the place of.
  Asset? _swapPartner(Asset scanned, Iterable<Asset> candidates) {
    if (scanned.status != AssetStatus.available || _checkedOutTo.containsKey(scanned.id)) {
      return null;
    }
    bool hasAccessories(Asset a) => _units.any((u) => u.parentAssetId == a.id);
    for (final partner in candidates) {
      if (partner.id == scanned.id ||
          partner.product.id != scanned.product.id ||
          partner.organization.id != scanned.organization.id ||
          (partner.bundleId == null && partner.parentAssetId == null) ||
          (partner.bundleId == scanned.bundleId &&
              partner.parentAssetId == scanned.parentAssetId) ||
          _checkedOutTo.containsKey(partner.id) ||
          partner.parentAssetId == scanned.id ||
          scanned.parentAssetId == partner.id ||
          (partner.parentAssetId != null && hasAccessories(scanned)) ||
          (scanned.parentAssetId != null && hasAccessories(partner))) {
        continue;
      }
      return partner;
    }
    return null;
  }

  /// A kit's or a unit's name, as the server names a place.
  String? _placeName(Asset unit) {
    if (unit.parentAssetId case final parentId?) {
      final parent = _units.where((a) => a.id == parentId).firstOrNull;
      if (parent == null) return parentId;
      final name = withCaption(parent.product.name, parent.product.caption);
      return '$name (${parent.assetTag ?? '#${parent.orgIndex}'})';
    }
    if (unit.bundleId case final bundleId?) {
      final kit = _bundles[bundleId];
      if (kit == null) return bundleId;
      return kit.tag == null ? kit.name : '${kit.name} (${kit.tag})';
    }
    return null;
  }

  /// Puts a unit somewhere, its accessories along.
  void _place(Asset unit, String? bundleId, String? parentAssetId, Location location) {
    Asset moved(Asset a, {String? parent}) => Asset(
      id: a.id,
      assetTag: a.assetTag,
      serialNumber: a.serialNumber,
      orgIndex: a.orgIndex,
      status: a.status,
      product: a.product,
      location: location,
      organization: a.organization,
      bundleId: bundleId,
      parentAssetId: parent,
    );
    for (var i = 0; i < _assets.length; i++) {
      final a = _assets[i];
      if (a.id == unit.id) _assets[i] = moved(a, parent: parentAssetId);
      if (a.parentAssetId == unit.id) _assets[i] = moved(a, parent: a.parentAssetId);
    }
  }

  /// Swaps the two units' places and writes it into both histories.
  ScanSwap _swap(Asset scanned, Asset partner, {Production? production}) {
    final scannedLinked = scanned.bundleId != null || scanned.parentAssetId != null;
    final joined = _placeName(partner) ?? '';
    final partnerTo = scannedLinked ? _placeName(scanned) : null;
    final scannedLabel = scanned.assetTag ?? '#${scanned.orgIndex}';
    final partnerLabel = partner.assetTag ?? '#${partner.orgIndex}';
    _place(scanned, partner.bundleId, partner.parentAssetId, partner.location);
    if (scannedLinked) {
      _place(partner, scanned.bundleId, scanned.parentAssetId, scanned.location);
    } else {
      _place(partner, null, null, partner.location);
    }
    final via = production == null ? TransactionSwapVia.caseCheck : TransactionSwapVia.handout;
    _log(
      scanned,
      'SWAPPED',
      production?.name ?? '',
      swap: TransactionSwap(
        partnerAssetId: partner.id,
        partnerLabel: partnerLabel,
        now: joined,
        before: partnerTo,
        via: via,
      ),
    );
    _log(
      partner,
      'SWAPPED',
      production?.name ?? '',
      swap: TransactionSwap(
        partnerAssetId: scanned.id,
        partnerLabel: scannedLabel,
        now: partnerTo,
        before: joined,
        via: via,
      ),
    );
    return ScanSwap(
      partnerAssetId: partner.id,
      partnerLabel: partnerLabel,
      joined: joined,
      partnerTo: partnerTo,
    );
  }

  // ---------------------------------------------------------------------------
  // DGUV inspections — mirrors services/inspections.ts on the server. The next
  // due date is never stored: it is derived from the interval and the latest
  // inspection on every read, as the server derives it on every write.

  /// Asset id → its inspections, in the order they were entered.
  final _inspections = <String, List<Inspection>>{};
  var _inspectionSeq = 0;

  void _seedInspections() {
    final today = DateTime.now().toUtc();
    for (final (tag, daysAgo, result) in DemoData.inspectionHistory) {
      final asset = _assets.where((a) => a.assetTag == tag).firstOrNull;
      if (asset == null) continue;
      final day = today.subtract(Duration(days: daysAgo));
      (_inspections[asset.id] ??= []).add(
        Inspection(
          id: 'insp_demo_${++_inspectionSeq}',
          assetId: asset.id,
          performedAt: DateTime.utc(day.year, day.month, day.day),
          result: InspectionResult.fromJson(result),
          inspectorName: 'Prüfdienst Nord GmbH',
          notes: null,
        ),
      );
    }
  }

  int? _intervalOf(Asset asset) => DemoData.inspectionIntervals[asset.product.id];

  /// Latest first by the day it took place, later entries first on the same
  /// day — the order the server lists them in.
  List<Inspection> _inspectionsOf(Asset asset) {
    final list = _inspections[asset.id] ?? const <Inspection>[];
    final indexed = list.indexed.toList()
      ..sort((a, b) {
        final byDay = b.$2.performedAt.compareTo(a.$2.performedAt);
        return byDay != 0 ? byDay : b.$1.compareTo(a.$1);
      });
    return [for (final (_, inspection) in indexed) inspection];
  }

  /// `inspectionDue` in apps/web/src/lib/inspection-due.ts.
  DateTime? _inspectionDue(Asset asset) {
    final interval = _intervalOf(asset);
    if (interval == null || interval == 0) return null;
    final latest = _inspectionsOf(asset).firstOrNull;
    if (latest == null) return DemoData.registeredAt();
    if (latest.result == InspectionResult.failed) return latest.performedAt;
    return _addMonths(latest.performedAt, interval);
  }

  /// Whole months in UTC, clamped to the end of a shorter month — 31 January
  /// plus one month is the end of February, as on the server.
  static DateTime _addMonths(DateTime date, int months) {
    final target = DateTime.utc(date.year, date.month + months);
    final lastDay = DateTime.utc(target.year, target.month + 1, 0).day;
    return DateTime.utc(
      target.year,
      target.month,
      date.day < lastDay ? date.day : lastDay,
    );
  }

  /// The demo account is a MEMBER on paper (see DemoData.currentUser), which
  /// would leave a reviewer nothing to inspect. So the demo lets it inspect
  /// its own organization's units and refuses the lent-in ones, which is the
  /// refusal an operator meets on a real server too.
  bool _mayInspect(Asset asset) => asset.organization.id == DemoData.nordlicht.id;

  Response<dynamic> _recordInspection(RequestOptions options) {
    // Like `_scan`: the body is the request model's own `toJson` map, so the
    // result may still be an enum here.
    final body = options.data;
    final code = body is Map ? '${body['code'] ?? ''}'.trim() : '';
    final rawDate = body is Map ? '${body['performedAt'] ?? ''}' : '';
    final rawResult = body is Map ? body['result'] : null;
    final result = rawResult is InspectionResult
        ? rawResult
        : InspectionResult.fromJson('${rawResult ?? ''}');
    final day = _parseDay(rawDate);
    if (code.isEmpty || day == null || result == InspectionResult.$unknown) {
      return _error(
        options,
        400,
        'invalid_request',
        'code, performedAt (YYYY-MM-DD) and result (PASSED|FAILED) are required.',
      );
    }
    // A day ahead of UTC is still today somewhere the app is used.
    if (day.isAfter(DateTime.now().toUtc().add(const Duration(days: 1)))) {
      return _error(
        options,
        400,
        'invalid_request',
        'The inspection date is in the future.',
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
    var asset = match.asset;
    if (asset == null) {
      return _error(options, 404, 'asset_not_found', 'Tag "$code" not found');
    }
    if (!_mayInspect(asset)) {
      return _error(options, 403, 'forbidden', 'No access to this asset');
    }
    if (asset.status == AssetStatus.sold || asset.status == AssetStatus.decommissioned) {
      return _error(
        options,
        409,
        'asset_retired',
        'This unit is sold or decommissioned and is not inspected.',
      );
    }

    String? text(Object? value) {
      final trimmed = value is String ? value.trim() : '';
      return trimmed.isEmpty ? null : trimmed;
    }

    final inspection = Inspection(
      id: 'insp_demo_${++_inspectionSeq}',
      assetId: asset.id,
      performedAt: day,
      result: result,
      inspectorName: text(body is Map ? body['inspectorName'] : null),
      notes: text(body is Map ? body['notes'] : null),
    );
    (_inspections[asset.id] ??= []).add(inspection);
    final markedBroken =
        result == InspectionResult.failed && asset.status != AssetStatus.broken;
    _log(
      asset,
      'INSPECTED',
      '',
      inspection: TransactionInspection(
        performedAt: inspection.performedAt,
        result: inspection.result,
        inspectorName: inspection.inspectorName,
        markedBroken: markedBroken,
      ),
    );
    if (markedBroken) asset = _replace(asset, status: AssetStatus.broken);

    return _ok(
      options,
      InspectionRecorded(
        inspection: inspection,
        asset: asset,
        inspectionIntervalMonths: _intervalOf(asset),
        nextInspectionDue: _inspectionDue(asset),
        markedBroken: markedBroken,
      ),
      status: 201,
    );
  }

  Response<dynamic> _deleteInspection(RequestOptions options, String id) {
    for (final MapEntry(key: assetId, value: list) in _inspections.entries) {
      final index = list.indexWhere((i) => i.id == id);
      if (index < 0) continue;
      final asset = _assets.firstWhere((a) => a.id == assetId);
      if (!_mayInspect(asset)) {
        return _error(options, 403, 'forbidden', 'No access to this asset');
      }
      // A BROKEN status the inspection set stays, as on the server: whether
      // the unit is broken is for someone to decide.
      final removed = list.removeAt(index);
      _log(
        asset,
        'INSPECTION_DELETED',
        '',
        inspection: TransactionInspection(
          performedAt: removed.performedAt,
          result: removed.result,
        ),
      );
      return _ok(
        options,
        InspectionDeleted(assetId: assetId, nextInspectionDue: _inspectionDue(asset)),
      );
    }
    return _error(options, 404, 'not_found', 'Inspection not found');
  }

  /// The types every installation has. The demo keeps one history per unit,
  /// so whichever type a reviewer picks is recorded like electrical.
  static const _inspectionTypes = [
    InspectionType(
      id: 'inst_electrical',
      key: 'electrical',
      name: 'Electrical (DGUV V3)',
      nameDe: 'Elektrisch (DGUV V3)',
      sortOrder: 0,
      failStatus: 'BROKEN',
      requiresQualification: true,
      hasMeasurements: true,
      defaultIntervalMonths: 12,
    ),
    InspectionType(
      id: 'inst_lifting',
      key: 'lifting',
      name: 'Lifting equipment',
      nameDe: 'Anschlagmittel',
      sortOrder: 1,
      failStatus: 'DECOMMISSIONED',
      requiresQualification: true,
      hasMeasurements: false,
      defaultIntervalMonths: 12,
    ),
    InspectionType(
      id: 'inst_visual',
      key: 'visual',
      name: 'Visual check',
      nameDe: 'Sichtprüfung',
      sortOrder: 2,
      failStatus: 'MAINTENANCE',
      requiresQualification: false,
      hasMeasurements: false,
      defaultIntervalMonths: null,
    ),
  ];

  /// A failed visual check: the unit goes into maintenance, as on the server.
  Response<dynamic> _reportDefect(RequestOptions options) {
    final body = options.data;
    final code = body is Map ? '${body['code'] ?? ''}'.trim() : '';
    final notes = body is Map ? '${body['notes'] ?? ''}'.trim() : '';
    if (code.isEmpty || notes.isEmpty) {
      return _error(
        options,
        400,
        'invalid_request',
        'code and notes (what is wrong) are required.',
      );
    }
    var asset = _resolve(code).asset;
    if (asset == null) {
      return _error(options, 404, 'asset_not_found', 'Tag "$code" not found');
    }
    final changed = asset.status != AssetStatus.maintenance;
    _log(
      asset,
      'INSPECTED',
      '',
      inspection: TransactionInspection(
        performedAt: DateTime.now().toUtc(),
        result: InspectionResult.failed,
        markedBroken: changed,
      ),
    );
    if (changed) asset = _replace(asset, status: AssetStatus.maintenance);
    return _ok(
      options,
      DefectReported(asset: asset, statusChanged: changed),
      status: 201,
    );
  }

  /// `YYYY-MM-DD` → midnight UTC, or null for anything that isn't a real day.
  static DateTime? _parseDay(String value) {
    final match = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$').firstMatch(value.trim());
    if (match == null) return null;
    final y = int.parse(match.group(1)!);
    final m = int.parse(match.group(2)!);
    final d = int.parse(match.group(3)!);
    final day = DateTime.utc(y, m, d);
    return day.year == y && day.month == m && day.day == d ? day : null;
  }

  // ---------------------------------------------------------------------------
  // Production checks — mirrors services/production-check.ts on the server.
  // A production's list is what is booked for it (`_booked`) and what is out on
  // it, and the demo user is on every side: one check per production.

  final _checks = <String, _DemoCheck>{};
  final _received = <String>{};
  final _returnReported = <String>{};
  var _checkSeq = 0;

  Response<dynamic> _startCheck(RequestOptions options, String productionId) {
    final production = DemoData.productions.where((p) => p.id == productionId).firstOrNull;
    if (production == null) {
      return _error(options, 404, 'not_found', 'Production not found');
    }
    final existing = _checks.values
        .where((c) => c.production.id == productionId && c.open)
        .firstOrNull;
    final check =
        existing ??
        (_checks['prck_demo_${++_checkSeq}'] = _DemoCheck(
          id: 'prck_demo_$_checkSeq',
          production: production,
        ));
    return _ok(options, _checkView(check));
  }

  Response<dynamic> _checkRoute(RequestOptions options, String method, String path) {
    // ['', 'api', 'v1', 'production-checks', id, sub?, assetId?]
    final parts = path.split('/');
    final check = _checks[parts[4]];
    if (check == null) return _error(options, 404, 'not_found', 'Check not found');
    final sub = parts.length > 5 ? parts[5] : null;
    if (method == 'GET' && sub == null) return _ok(options, _checkView(check));
    if (!check.open) {
      return _error(options, 409, 'check_closed', 'This check is already closed');
    }
    final listed = _checkList(check).map((a) => a.id).toSet();
    final lent = {
      for (final a in _checkList(check))
        if (a.organization.id != check.production.organization.id) a.id,
    };

    switch ((method, sub)) {
      case ('POST', 'scans'):
        final body = options.data;
        final code = body is Map ? '${body['code'] ?? ''}'.trim() : '';
        final match = _resolve(code);
        if (match.ambiguous) {
          return _error(options, 409, 'serial_ambiguous', 'Serial number is on more than one unit');
        }
        final asset = match.asset;
        if (asset == null) {
          return _error(options, 404, 'asset_not_found', 'Tag "$code" not found');
        }
        final String result;
        var ticked = 0;
        if (check.ticks.containsKey(asset.id)) {
          result = listed.contains(asset.id) ? 'already' : 'unexpected';
        } else if (!listed.contains(asset.id)) {
          check.ticks[asset.id] = 'scan';
          result = 'unexpected';
          ticked = 1;
        } else {
          final riders = _assets.where(
            (a) => a.parentAssetId == asset.id && a.assetTag == null && listed.contains(a.id),
          );
          for (final a in [asset, ...riders]) {
            if (check.ticks.putIfAbsent(a.id, () => 'scan') == 'scan') ticked++;
          }
          result = 'ticked';
        }
        return _ok(
          options,
          ProductionCheckScanResult(
            result: ProductionCheckScanResultResult.fromJson(result),
            assetTag: asset.assetTag ?? code,
            productName: asset.product.name,
            ticked: ticked,
          ),
        );
      case ('POST', 'ticks'):
        final body = options.data;
        final ids = body is Map ? (body['assetIds'] as List? ?? const []) : const [];
        var ticked = 0;
        for (final id in ids.whereType<String>().where(listed.contains)) {
          if (!check.ticks.containsKey(id)) {
            check.ticks[id] = 'manual';
            ticked++;
          }
        }
        return _ok(options, ProductionCheckTickResult(ticked: ticked));
      case ('DELETE', 'ticks'):
        check.ticks.remove(parts[6]);
        return _noContent(options);
      case ('PUT', 'lines'):
        final body = options.data;
        final key = body is Map ? '${body['key'] ?? ''}' : '';
        final count = body is Map ? (body['count'] as num? ?? 0).toInt() : 0;
        final line = _lines(
          _checkList(check),
          check.production,
          (a) => check.ticks.containsKey(a.id),
        ).where((l) => l.key == key).firstOrNull;
        if (line == null) return _ok(options, const ProductionListLineResult(done: 0));
        final target = count.clamp(0, line.total);
        final ticked = line.assetIds.where(check.ticks.containsKey).toList();
        if (target > ticked.length) {
          final open = line.assetIds.where((id) => !check.ticks.containsKey(id));
          for (final id in open.take(target - ticked.length)) {
            check.ticks[id] = 'manual';
          }
        } else {
          for (final id in ticked.skip(target)) {
            check.ticks.remove(id);
          }
        }
        return _ok(options, ProductionListLineResult(done: target));
      case ('POST', 'close'):
        final found = listed.where(check.ticks.containsKey).length;
        check.open = false;
        for (final asset in _checkList(check)) {
          _log(asset, 'PRODUCTION_CHECKED', check.production.name);
        }
        return _ok(
          options,
          ProductionCheckCloseResult(found: found, missing: listed.length - found),
        );
      case ('POST', 'receipt'):
        final ids = lent.where((id) => check.ticks.containsKey(id) && !_received.contains(id));
        final count = ids.length;
        _received.addAll(ids.toList());
        return _ok(options, HandoverResult(count: count));
      case ('POST', 'return-report'):
        final ids = lent.where(
          (id) =>
              check.ticks.containsKey(id) &&
              _received.contains(id) &&
              !_returnReported.contains(id),
        );
        final count = ids.length;
        _returnReported.addAll(ids.toList());
        return _ok(options, HandoverResult(count: count));
    }
    return _error(options, 404, 'not_found', 'Not available in the demo');
  }

  /// What is booked for the production or out on it, as a check lists it.
  List<Asset> _checkList(_DemoCheck check) => _sorted(check.production, [
    for (final asset in _units)
      if (_checkedOutTo[asset.id]?.id == check.production.id ||
          (_booked[check.production.id]?.contains(asset.id) ?? false))
        asset,
  ]);

  /// Sorted as the server sends it: own units by location, then lent ones.
  List<Asset> _sorted(Production production, List<Asset> list) {
    String key(Asset a) => a.organization.id == production.organization.id
        ? '0${a.location.name}|${a.product.name}|${a.orgIndex.toString().padLeft(6, '0')}'
        : '1${a.organization.name}|${a.product.name}';
    return list..sort((a, b) => key(a).compareTo(key(b)));
  }

  ProductionCheckGroup _groupOf(Asset asset, Production production) =>
      asset.organization.id == production.organization.id
      ? ProductionCheckGroup(
          kind: ProductionCheckGroupKind.location,
          name: asset.location.name,
        )
      : ProductionCheckGroup(
          kind: ProductionCheckGroupKind.lender,
          name: asset.organization.shortName ?? asset.organization.name,
        );

  /// Mirrors `buildLines`: units told apart by nothing, one line per product,
  /// location and owner.
  List<ProductionListLine> _lines(
    List<Asset> list,
    Production production,
    bool Function(Asset) done,
  ) {
    final byKey = <String, List<Asset>>{};
    for (final a in list) {
      if (a.assetTag != null || a.bundleId != null || a.parentAssetId != null) continue;
      if (_units.any((u) => u.parentAssetId == a.id)) continue;
      if (_isPackCase(a)) continue;
      final key =
          '${a.product.id}|${a.location.id}|${a.organization.id}|${_caseOf(a, production)?.assetId ?? ''}';
      byKey.putIfAbsent(key, () => []).add(a);
    }
    return [
      for (final MapEntry(:key, value: units) in byKey.entries)
        ProductionListLine(
          key: key,
          productName: units.first.product.name,
          productCaption: units.first.product.caption,
          manufacturerName: units.first.product.manufacturerName,
          ownerOrgId: units.first.organization.id,
          lengthCm: units.first.product.cable?.lengthCm,
          lentBy: units.first.organization.id == production.organization.id
              ? null
              : units.first.organization.shortName ?? units.first.organization.name,
          group: _groupOf(units.first, production),
          assetIds: [for (final u in units) u.id],
          total: units.length,
          done: units.where(done).length,
          floor: 0,
          packCase: _caseOf(units.first, production),
        ),
    ];
  }

  ProductionCheck _checkView(_DemoCheck check) {
    final list = _checkList(check);
    final listed = list.map((a) => a.id).toSet();
    final lentTicked = [
      for (final a in list)
        if (a.organization.id != check.production.organization.id &&
            check.ticks.containsKey(a.id))
          a.id,
    ];
    return ProductionCheck(
      id: check.id,
      status: check.open ? ProductionCheckStatus.open : ProductionCheckStatus.closed,
      productionId: check.production.id,
      productionName: check.production.name,
      side: ProductionCheckSide(
        organizationId: check.production.organization.id,
        organizationName: check.production.organization.name,
        own: true,
      ),
      createdAt: check.createdAt,
      createdBy: DemoData.user.name ?? DemoData.user.email,
      closedAt: null,
      closedBy: null,
      items: [
        for (final asset in list)
          ProductionCheckItem(
            assetId: asset.id,
            assetTag: asset.assetTag,
            productName: asset.product.name,
            productCaption: asset.product.caption,
            manufacturerName: asset.product.manufacturerName,
            ownerOrgId: asset.organization.id,
            lengthCm: asset.product.cable?.lengthCm,
            lentBy: asset.organization.id == check.production.organization.id
                ? null
                : asset.organization.shortName ?? asset.organization.name,
            accessoryOf: asset.parentAssetId,
            group: _groupOf(asset, check.production),
            status: _checkedOutTo[asset.id]?.id == check.production.id
                ? ProductionCheckItemStatus.checkedOut
                : ProductionCheckItemStatus.approved,
            received: _received.contains(asset.id),
            returnReported: _returnReported.contains(asset.id),
            tick: switch (check.ticks[asset.id]) {
              final via? => ProductionCheckTick(
                userName: DemoData.user.name ?? DemoData.user.email,
                mine: true,
                via: ProductionCheckTickVia.fromJson(via),
                at: DateTime.now(),
              ),
              null => null,
            },
          ),
      ],
      lines: _lines(list, check.production, (a) => check.ticks.containsKey(a.id)),
      unexpected: [
        for (final id in check.ticks.keys.where((id) => !listed.contains(id)))
          if (_units.where((a) => a.id == id).firstOrNull case final asset?)
            ProductionCheckUnexpected(
              assetId: asset.id,
              assetTag: asset.assetTag,
              productName: asset.product.name,
              userName: DemoData.user.name ?? DemoData.user.email,
              mine: true,
            ),
      ],
      canConfirmReceipt: check.open
          ? lentTicked.where((id) => !_received.contains(id)).length
          : 0,
      canReportReturn: check.open
          ? lentTicked
                .where((id) => _received.contains(id) && !_returnReported.contains(id))
                .length
          : 0,
    );
  }


  // ---------------------------------------------------------------------------
  // Handing out and taking back — mirrors services/production-handout.ts. A
  // tick is the booking itself, so the state is `_checkedOutTo` and nothing
  // else; `_returnedFrom` remembers what came back, so the take-back list
  // still shows it ticked.

  /// Untagged cables on the shelf, booked for the festival, so a counted line
  /// has something to count. Not in `_assets`: they have no tag to look up and
  /// would only clutter the inventory and the stocktake.
  late final List<Asset> _looseUnits = [
    for (var i = 1; i <= 12; i++)
      Asset(
        id: 'asset_demo_schuko_$i',
        assetTag: null,
        serialNumber: null,
        orgIndex: 200 + i,
        status: AssetStatus.available,
        product: _looseCable,
        location: DemoData.locations.first,
        organization: DemoData.nordlicht,
        bundleId: null,
        parentAssetId: null,
      ),
  ];

  /// Every unit there is, tagged or not.
  List<Asset> get _units => [..._assets, ..._looseUnits];

  late final Map<String, Set<String>> _booked = {
    'prdn_demo_festival': {
      'asset_demo_40000001',
      'asset_demo_40000002',
      'asset_demo_40000004',
      'asset_demo_40000006',
      'asset_demo_40000008',
      'asset_demo_40000011',
      'asset_demo_40000013',
      'asset_demo_40000014',
      'asset_demo_40000015',
      for (final unit in _looseUnits.take(10)) unit.id,
    },
  };
  final _returnedFrom = <String, Set<String>>{};

  bool _isOut(Asset a, Production p) => _checkedOutTo[a.id]?.id == p.id;

  bool _handoutDone(Asset a, Production p, HandoutMode mode) => mode == HandoutMode.checkout
      ? _isOut(a, p)
      : !_isOut(a, p) && (_returnedFrom[p.id]?.contains(a.id) ?? false);

  /// Taking back lists what is booked as well, handed out or not — kit goes
  /// out unscanned, and comes back all the same.
  List<Asset> _handoutList(Production p, HandoutMode mode) => _sorted(p, [
    for (final a in _units)
      // Handing out leaves what came back off, as the server's statuses do.
      if (_isOut(a, p) ||
          (_booked[p.id]?.contains(a.id) ?? false) &&
              (mode == HandoutMode.checkin || !(_returnedFrom[p.id]?.contains(a.id) ?? false)))
        a,
  ]);

  void _handOut(Asset asset, Production p) {
    _checkedOutTo[asset.id] = p;
    (_booked[p.id] ??= {}).add(asset.id);
    _returnedFrom[p.id]?.remove(asset.id);
    _returnReported.remove(asset.id);
    if (asset.organization.id != p.organization.id) _received.add(asset.id);
    _log(asset, 'CHECKED_OUT', p.name);
  }

  void _setDone(Asset asset, Production p, HandoutMode mode, bool done) {
    if (_handoutDone(asset, p, mode) == done) return;
    switch ((mode, done)) {
      case (HandoutMode.checkout, true) || (HandoutMode.checkin, false):
        _handOut(asset, p);
      case (HandoutMode.checkout, false):
        _checkedOutTo.remove(asset.id);
        _packedIn[p.id]?.remove(asset.id);
        _log(asset, 'CHECKOUT_UNDONE', p.name);
      default:
        _checkedOutTo.remove(asset.id);
        _packedIn[p.id]?.remove(asset.id);
        (_returnedFrom[p.id] ??= {}).add(asset.id);
        _log(asset, 'RETURNED', p.name);
    }
  }

  Response<dynamic> _handoutRoute(RequestOptions options, String method, List<String> parts) {
    final production = DemoData.productions.where((p) => p.id == parts[4]).firstOrNull;
    if (production == null) {
      return _error(options, 403, 'forbidden', 'No access to this production');
    }
    final mode = HandoutMode.fromJson(parts[6]);
    if (mode == HandoutMode.$unknown) {
      return _error(options, 400, 'invalid_request', 'mode is checkout or checkin.');
    }
    final sub = parts.length > 7 ? parts[7] : null;
    final body = options.data is Map ? options.data as Map : const {};
    final byId = {for (final a in _units) a.id: a};

    if (sub == 'additions') {
      if (mode != HandoutMode.checkout) {
        return _error(options, 404, 'not_found', 'Additions are on the checkout list only.');
      }
      return method == 'GET'
          ? _ok(options, _handoutAdditions(production, options.queryParameters))
          : _handOutAdditions(options, production, body);
    }

    switch ((method, sub)) {
      case ('GET', null):
        return _ok(options, _handoutView(production, mode));
      case ('POST', 'scans'):
        final code = '${body['code'] ?? ''}'.trim();
        final match = _resolve(code);
        if (match.ambiguous) {
          return _error(options, 409, 'serial_ambiguous', 'Serial number is on more than one unit');
        }
        final asset = match.asset;
        if (asset == null) {
          return _error(options, 404, 'asset_not_found', 'Tag "$code" not found');
        }
        final scanned = ScannedAsset(
          id: asset.id,
          assetTag: asset.assetTag ?? code,
          productName: asset.product.name,
          productCaption: asset.product.caption,
          manufacturerName: asset.product.manufacturerName,
          ownerOrgId: asset.organization.id,
          lengthCm: asset.product.cable?.lengthCm,
        );
        if (mode == HandoutMode.checkout) {
          // Not booked itself: it may take the place of a linked unit that is.
          final booked = _booked[production.id] ?? const <String>{};
          final partner = booked.contains(asset.id)
              ? null
              : _swapPartner(asset, [
                  for (final u in _units)
                    if (booked.contains(u.id) && !_isOut(u, production)) u,
                ]);
          final swap = partner == null ? null : _swap(asset, partner, production: production);
          if (partner != null) _booked[production.id]?.remove(partner.id);
          _handOut(_assets.firstWhere((a) => a.id == asset.id, orElse: () => asset), production);
          // A pack case is opened by the client; anything else goes into the
          // open one — see packScanned in services/production-handout.ts.
          final packCase = _isPackCase(asset) ? _caseRef(asset) : null;
          final packInto = body['packInto'] as String?;
          final into = packCase == null && packInto != null ? byId[packInto] : null;
          if (into != null && _isPackCase(into)) {
            if (!_isOut(into, production)) _handOut(into, production);
            (_packedIn[production.id] ??= {})[asset.id] = into.id;
          }
          return _ok(
            options,
            ScanResult(
              asset: scanned,
              action: ScanResultAction.checkedOut,
              targetName: production.name,
              returnedFrom: const [],
              swap: swap,
              packCase: packCase,
              packedInto: into != null && _isPackCase(into) ? into.id : null,
            ),
          );
        }
        // Booked here and never handed out: it was out all the same.
        final from =
            _checkedOutTo.remove(asset.id) ??
            ((_booked[production.id]?.contains(asset.id) ?? false) ? production : null);
        if (from != null) {
          (_returnedFrom[from.id] ??= {}).add(asset.id);
          // Back is out of its case; a case's contents stay in it until they are.
          _packedIn[from.id]?.remove(asset.id);
          _log(asset, 'RETURNED', from.name);
        }
        return _ok(
          options,
          ScanResult(
            asset: scanned,
            action: ScanResultAction.locationAssigned,
            targetName: asset.location.name,
            returnedFrom: from == null ? const [] : [from.name],
            packCase: _isPackCase(asset) ? _caseRef(asset) : null,
          ),
        );
      case ('POST', 'ticks'):
        final done = body['done'] == true;
        var count = 0;
        for (final id in (body['assetIds'] as List? ?? const []).whereType<String>()) {
          final asset = byId[id];
          if (asset == null) continue;
          _setDone(asset, production, mode, done);
          count++;
        }
        return _ok(options, HandoverResult(count: count));
      case ('PUT', 'lines'):
        final key = '${body['key'] ?? ''}';
        final count = (body['count'] as num? ?? 0).toInt();
        final line = _lines(
          _handoutList(production, mode),
          production,
          (a) => _handoutDone(a, production, mode),
        ).where((l) => l.key == key).firstOrNull;
        if (line == null) return _ok(options, const ProductionListLineResult(done: 0));
        final target = count.clamp(0, line.total);
        final units = [for (final id in line.assetIds) byId[id]!];
        final done = units.where((a) => _handoutDone(a, production, mode)).toList();
        if (target > done.length) {
          final open = units.where((a) => !_handoutDone(a, production, mode)).toList();
          for (final a in open.take(target - done.length)) {
            _setDone(a, production, mode, true);
          }
        } else {
          for (final a in done.skip(target)) {
            _setDone(a, production, mode, false);
          }
        }
        return _ok(options, ProductionListLineResult(done: target));
    }
    return _error(options, 404, 'not_found', 'Not available in the demo');
  }

  /// Mirrors `searchHandoutAdditions`: the side's free units of a product
  /// matching the search, not on this list, in no kit, grouped by product,
  /// shelf and owner. Nothing below two characters.
  List<HandoutAddition> _handoutAdditions(Production p, Map<String, dynamic> query) {
    final q = '${query['q'] ?? ''}'.trim();
    if (q.length < 2) return const [];
    final side = query['organizationId'] as String? ?? p.organization.id;
    final groups = <String, List<Asset>>{};
    for (final a in _additionCandidates(p, side)) {
      if (!_matches(a.product, q)) continue;
      groups.putIfAbsent(_additionKey(a), () => []).add(a);
    }
    return [
      for (final MapEntry(:key, value: units) in groups.entries)
        HandoutAddition(
          key: key,
          productId: units.first.product.id,
          organizationId: units.first.organization.id,
          locationId: units.first.location.id,
          productName: units.first.product.name,
          productCaption: units.first.product.caption,
          productImageUrl: units.first.product.imageUrl,
          manufacturerName: units.first.product.manufacturerName,
          locationName: units.first.location.name,
          organizationName:
              units.first.organization.shortName ?? units.first.organization.name,
          available: units.length,
          untagged: units.where((u) => u.assetTag == null).length,
        ),
    ]..sort((a, b) => naturalCompare(a.productName, b.productName));
  }

  Response<dynamic> _handOutAdditions(RequestOptions options, Production p, Map body) {
    final side = body['organizationId'] as String? ?? p.organization.id;
    final count = (body['count'] as num? ?? 0).toInt();
    final key = '${body['productId']}|${body['locationId']}|${body['ownerId']}';
    if (count < 1) {
      return _error(options, 400, 'invalid_request', 'count must be at least 1.');
    }
    final picked = _untaggedFirst(
      _additionCandidates(p, side).where((a) => _additionKey(a) == key),
    ).take(count).toList();
    for (final asset in picked) {
      _handOut(asset, p);
    }
    return _ok(options, CountResult(count: picked.length));
  }

  /// The side's units that could still go out on [p]: free, on no list, in
  /// no kit, not an accessory.
  Iterable<Asset> _additionCandidates(Production p, String side) => _units.where(
    (a) =>
        a.organization.id == side &&
        a.status == AssetStatus.available &&
        a.bundleId == null &&
        a.parentAssetId == null &&
        !_checkedOutTo.containsKey(a.id) &&
        !(_booked[p.id]?.contains(a.id) ?? false),
  );

  String _additionKey(Asset a) => '${a.product.id}|${a.location.id}|${a.organization.id}';

  ProductionHandout _handoutView(Production p, HandoutMode mode) {
    final list = _handoutList(p, mode);
    return ProductionHandout(
      mode: mode,
      productionId: p.id,
      productionName: p.name,
      cancelled: false,
      // The demo user is on every side; one is enough to show the list.
      side: ProductionCheckSide(
        organizationId: p.organization.id,
        organizationName: p.organization.shortName ?? p.organization.name,
        own: true,
      ),
      sides: [
        ProductionCheckSide(
          organizationId: p.organization.id,
          organizationName: p.organization.shortName ?? p.organization.name,
          own: true,
        ),
      ],
      items: [
        for (final asset in list)
          ProductionHandoutItem(
            assetId: asset.id,
            assetTag: asset.assetTag,
            productName: asset.product.name,
            productCaption: asset.product.caption,
            manufacturerName: asset.product.manufacturerName,
            ownerOrgId: asset.organization.id,
            lengthCm: asset.product.cable?.lengthCm,
            lentBy: asset.organization.id == p.organization.id
                ? null
                : asset.organization.shortName ?? asset.organization.name,
            accessoryOf: asset.parentAssetId,
            group: _groupOf(asset, p),
            status: _isOut(asset, p)
                ? ProductionHandoutItemStatus.checkedOut
                : _returnedFrom[p.id]?.contains(asset.id) ?? false
                ? ProductionHandoutItemStatus.returned
                : ProductionHandoutItemStatus.approved,
            done: _handoutDone(asset, p, mode),
            received: _received.contains(asset.id),
            returnReported: _returnReported.contains(asset.id),
            packCase: _caseOf(asset, p),
            isPackCase: _isPackCase(asset),
          ),
      ],
      lines: _lines(list, p, (a) => _handoutDone(a, p, mode)),
      othersCount: 0,
    );
  }

  // ---------------------------------------------------------------------------
  // Pack cases — mirrors packIntoCase in services/production-handout.ts. What
  // is in which case, per production, by asset id.

  final _packedIn = <String, Map<String, String>>{};

  static const _containerProducts = {'prd_demo_transflex'};

  /// A container in no kit is a pack case; in a kit it would be the kit's case.
  bool _isPackCase(Asset a) =>
      _containerProducts.contains(a.product.id) && a.bundleId == null;

  PackCaseRef _caseRef(Asset a) => PackCaseRef(
    assetId: a.id,
    name: withCaption(a.product.name, a.product.caption),
    tag: a.assetTag,
    orgIndex: a.orgIndex ?? 0,
  );

  /// The case [a] is listed under on [p]: its own for a case, else the one it
  /// is in — with the cases around it, outermost first.
  PackCase? _caseOf(Asset a, Production p) {
    final packed = _packedIn[p.id] ?? const <String, String>{};
    final byId = {for (final u in _units) u.id: u};
    final head = _isPackCase(a) ? a : byId[packed[a.id]];
    if (head == null) return null;
    final path = <PackCaseRef>[];
    final seen = {head.id};
    for (
      var at = byId[packed[head.id]];
      at != null && seen.add(at.id);
      at = byId[packed[at.id]]
    ) {
      path.insert(0, _caseRef(at));
    }
    final ref = _caseRef(head);
    return PackCase(
      assetId: ref.assetId,
      name: ref.name,
      tag: ref.tag,
      orgIndex: ref.orgIndex,
      path: path,
    );
  }

  Response<dynamic> _packingRoute(
    RequestOptions options,
    String method,
    List<String> parts,
  ) {
    final production = DemoData.productions.where((p) => p.id == parts[4]).firstOrNull;
    if (production == null) {
      return _error(options, 403, 'forbidden', 'No access to this production');
    }
    final byId = {for (final a in _units) a.id: a};
    if (method == 'GET' && parts.length == 8 && parts[7] == 'label') {
      final c = byId[parts[6]];
      if (c == null || !_isPackCase(c)) {
        return _error(
          options,
          409,
          'not_a_pack_case',
          'That is no pack case on this production',
        );
      }
      return _packLabel(options, production, c);
    }
    if (method != 'POST' || parts.length != 6) {
      return _error(options, 404, 'not_found', 'Not available in the demo');
    }
    final body = options.data is Map ? options.data as Map : const {};
    final packed = _packedIn[production.id] ??= {};
    final ids = [...(body['assetIds'] as List? ?? const []).whereType<String>()];
    // A nested model arrives as itself: a generated toJson is shallow.
    final rawLine = body['line'];
    final line = rawLine is ProductionListLineCount
        ? rawLine
        : rawLine is Map
        ? ProductionListLineCount.fromJson(rawLine.cast<String, Object?>())
        : null;
    if (line != null) {
      final key = line.key;
      final count = line.count;
      final found = _lines(
        _handoutList(production, HandoutMode.checkout),
        production,
        (a) => _isOut(a, production),
      ).where((l) => l.key == key).firstOrNull;
      if (found != null) {
        // The units already out first, then the rest — see pickToPack.
        final units = [for (final id in found.assetIds) byId[id]!];
        ids.addAll(
          [
            ...units.where((a) => _isOut(a, production)),
            ...units.where((a) => !_isOut(a, production)),
          ].take(count).map((a) => a.id),
        );
      }
    }
    final caseId = body['caseAssetId'] as String?;
    if (caseId == null) {
      for (final id in ids) {
        packed.remove(id);
      }
      return _ok(options, HandoverResult(count: ids.length));
    }
    final target = byId[caseId];
    if (target == null || !_isPackCase(target)) {
      return _error(
        options,
        409,
        'not_a_pack_case',
        'That is no pack case on this production',
      );
    }
    // Never a case into itself or into something it holds.
    final seen = <String>{};
    for (String? at = caseId; at != null && seen.add(at); at = packed[at]) {
      if (ids.contains(at)) {
        return _error(
          options,
          409,
          'pack_circle',
          'A case cannot go into itself or into something it holds',
        );
      }
    }
    if (!_isOut(target, production)) _handOut(target, production);
    for (final id in ids) {
      final asset = byId[id];
      if (asset == null) continue;
      if (!_isOut(asset, production)) _handOut(asset, production);
      packed[id] = caseId;
    }
    return _ok(options, HandoverResult(count: ids.length));
  }

  Response<dynamic> _packLabel(RequestOptions options, Production p, Asset c) {
    final small = options.queryParameters['size'] == 'small';
    String field(String text) => text.replaceAll(RegExp(r'[\^~]'), ' ');
    final (width, height) = small ? (80.0, 55.0) : (101.6, 152.4);
    final number = c.assetTag ?? '#${c.orgIndex ?? 0}';
    final inside = [
      for (final MapEntry(:key, :value) in (_packedIn[p.id] ?? const {}).entries)
        if (value == c.id) _units.firstWhere((u) => u.id == key),
    ];
    final zpl =
        StringBuffer('^XA^CI28^PW${(width * 8).round()}^LL${(height * 8).round()}^LH0,0')
          ..write('^FO32,32^A0N,96,96^FDKiste ${field(number)}^FS')
          ..write('^FO32,140^A0N,34,34^FD${field('${p.name} · ${c.product.name}')}^FS');
    if (c.assetTag != null) zpl.write('^FO32,200^BXN,14,200^FD${field(c.assetTag!)}^FS');
    if (!small) {
      var y = 420;
      for (final unit in inside.take(16)) {
        final name = _isPackCase(unit)
            ? 'Kiste ${unit.assetTag ?? '#${unit.orgIndex ?? 0}'} (${unit.product.name})'
            : unit.product.name;
        zpl.write('^FO32,$y^A0N,30,30^FD1× ${field(name)}^FS');
        y += 40;
      }
    }
    zpl.write('^XZ');
    final text = zpl.toString();
    return _ok(
      options,
      CaseLabel(
        size: small ? CaseLabelSize.small : CaseLabelSize.large,
        zpl: text,
        labelCount: 1,
        widthMm: width,
        heightMm: height,
        dpmm: 8,
        previewUrl: Uri.https('labelary.com', '/viewer.html', {
          'density': '8',
          'width': '$width',
          'height': '$height',
          'units': 'mm',
          'zpl': text,
        }).toString(),
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Case checks — mirrors services/case-check.ts on the server.

  final _lastCaseCheck = <String, CaseCheckLast>{};

  Response<dynamic> _openCase(RequestOptions options, String code) {
    final kit = _bundles.values.where((b) => b.tag == code.trim()).firstOrNull;
    if (kit != null) {
      return _ok(options, _case(CaseKind.bundle, kit.id, null));
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
    if (asset.bundleId case final bundleId?) {
      return _ok(options, _case(CaseKind.bundle, bundleId, asset.id));
    }
    if (asset.parentAssetId case final parentId?) {
      return _ok(options, _case(CaseKind.asset, parentId, asset.id));
    }
    if (_assets.any((a) => a.parentAssetId == asset.id)) {
      return _ok(options, _case(CaseKind.asset, asset.id, asset.id));
    }
    return _error(
      options,
      409,
      'not_a_case',
      '${asset.product.name} is neither a kit nor has accessories',
    );
  }

  List<Asset> _caseUnits(CaseKind kind, String id) => kind == CaseKind.bundle
      ? _units.where((a) => a.bundleId == id).toList()
      : [
          ..._assets.where((a) => a.id == id),
          ..._assets.where((a) => a.parentAssetId == id),
        ];

  /// Where most of the case is — home counting as a place — and so which of
  /// its units are away on another job.
  String? _caseProductionId(List<Asset> units) {
    final tally = <String?, int>{};
    for (final unit in units) {
      final id = _checkedOutTo[unit.id]?.id;
      tally[id] = (tally[id] ?? 0) + 1;
    }
    if (tally.isEmpty) return null;
    return (tally.entries.toList()..sort((a, b) => b.value.compareTo(a.value))).first.key;
  }

  CaseCheck _case(CaseKind kind, String id, String? scannedAssetId) {
    final units = _caseUnits(kind, id);
    final home = _caseProductionId(units);
    final inCase = {for (final u in units) u.id};
    final kit = kind == CaseKind.bundle ? _bundles[id] : null;
    final name = kit != null
        ? (kit.tag == null ? kit.name : '${kit.name} (${kit.tag})')
        : units.first.product.name;
    return CaseCheck(
      kind: kind,
      id: id,
      tag: kit?.tag,
      name: name,
      checkedOutTo: home == null
          ? null
          : DemoData.productions.firstWhere((p) => p.id == home).name,
      items: [
        for (final unit in units)
          CaseCheckItem(
            assetId: unit.id,
            assetTag: unit.assetTag,
            serialNumber: unit.serialNumber,
            orgIndex: unit.orgIndex ?? 0,
            name: productLabel(unit.product.manufacturerName, unit.product.name),
            caption: unit.product.caption,
            accessoryOf: inCase.contains(unit.parentAssetId) ? unit.parentAssetId : null,
            awayOn: switch (_checkedOutTo[unit.id]) {
              final p? when p.id != home => p.name,
              _ => null,
            },
          ),
      ],
      shortOfType: const [],
      lastCheck: _lastCaseCheck[id],
      canRecord: true,
      scannedAssetId: scannedAssetId,
    );
  }

  /// A plain stand-in for the server's label: the case's name, its tag as a
  /// DataMatrix, its contents. The layout itself is the server's
  /// (case-label-zpl.ts); the demo only needs something real to preview and
  /// print.
  Response<dynamic> _caseLabel(RequestOptions options, CaseKind kind, String id) {
    final small = options.queryParameters['size'] == 'small';
    final check = _case(kind, id, null);
    final tag = check.tag ?? check.items.firstOrNull?.assetTag;
    String field(String text) => text.replaceAll(RegExp(r'[\^~]'), ' ');
    final (width, height) = small ? (80.0, 55.0) : (101.6, 152.4);
    final zpl = StringBuffer('^XA^CI28^PW${(width * 8).round()}^LL${(height * 8).round()}^LH0,0')
      ..write('^FO32,32^A0N,36,36^FDTechnikpool Demo^FS')
      ..write('^FO32,90^A0N,52,52^FD${field(check.name)}^FS');
    if (tag != null) zpl.write('^FO32,170^BXN,14,200^FD${field(tag)}^FS');
    if (!small) {
      var y = 400;
      for (final item in check.items.take(16)) {
        zpl.write('^FO${item.accessoryOf == null ? 32 : 68},$y^A0N,30,30^FD${field(item.name)}^FS');
        y += 40;
      }
    }
    zpl.write('^XZ');
    final text = zpl.toString();
    return _ok(
      options,
      CaseLabel(
        size: small ? CaseLabelSize.small : CaseLabelSize.large,
        zpl: text,
        labelCount: 1,
        widthMm: width,
        heightMm: height,
        dpmm: 8,
        previewUrl: Uri.https('labelary.com', '/viewer.html', {
          'density': '8',
          'width': '$width',
          'height': '$height',
          'units': 'mm',
          'zpl': text,
        }).toString(),
      ),
    );
  }

  /// A code the case check did not find on its list — mirrors `scanIntoCase`.
  Response<dynamic> _scanIntoCase(RequestOptions options, CaseKind kind, String id) {
    final body = options.data is Map ? options.data as Map : const {};
    final code = '${body['code'] ?? ''}'.trim();
    final found = {...(body['foundAssetIds'] as List? ?? const []).whereType<String>()};
    final check = _case(kind, id, null);
    final asset = _resolve(code).asset;
    CaseCheckScanResult foreign(String? name) =>
        CaseCheckScanResult(
          outcome: CaseCheckScanResultOutcome.foreign,
          assetId: null,
          name: name,
          swap: null,
          check: null,
        );
    if (asset == null) {
      final kit = _bundles.values.where((b) => b.tag == code).firstOrNull;
      return _ok(options, foreign(kit?.name));
    }
    if (check.items.any((i) => i.assetId == asset.id)) {
      return _ok(
        options,
        CaseCheckScanResult(
          outcome: CaseCheckScanResultOutcome.found,
          assetId: asset.id,
          name: null,
          swap: null,
          check: null,
        ),
      );
    }
    final open = {
      for (final item in check.items)
        if (!found.contains(item.assetId) &&
            item.awayOn == null &&
            !(kind == CaseKind.asset && item.assetId == id))
          item.assetId,
    };
    final partner = _swapPartner(asset, [
      for (final u in _units)
        if (open.contains(u.id)) u,
    ]);
    if (partner == null) {
      return _ok(options, foreign(productLabel(asset.product.manufacturerName, asset.product.name)));
    }
    final swap = _swap(asset, partner);
    return _ok(
      options,
      CaseCheckScanResult(
        outcome: CaseCheckScanResultOutcome.swapped,
        assetId: asset.id,
        name: null,
        swap: swap,
        check: _case(kind, id, null),
      ),
    );
  }

  Response<dynamic> _recordCase(RequestOptions options) {
    // As in `_scan`: the body is the model's own `toJson` map, so `kind` may
    // still be the enum rather than its string.
    final body = options.data;
    if (body is! Map) {
      return _error(options, 400, 'invalid_request', 'kind, id and foundAssetIds are required');
    }
    final rawKind = body['kind'];
    final kind = rawKind is CaseKind ? rawKind : CaseKind.fromJson('$rawKind');
    final id = body['id'] as String;
    final check = _case(kind, id, null);
    final found = {...(body['foundAssetIds'] as List).cast<String>()};
    var foundCount = 0, missing = 0, away = 0;
    for (final item in check.items) {
      if (found.contains(item.assetId)) {
        foundCount++;
      } else if (item.awayOn != null) {
        away++;
      } else {
        missing++;
      }
    }
    for (final item in check.items) {
      final unit = _assets.firstWhere((a) => a.id == item.assetId);
      _log(unit, 'CASE_CHECKED', check.name);
    }
    _lastCaseCheck[id] = CaseCheckLast(
      at: DateTime.now(),
      userName: DemoData.user.name ?? DemoData.user.email,
      found: foundCount,
      expected: check.items.length,
    );
    return _ok(
      options,
      CaseCheckResult(found: foundCount, missing: missing, away: away),
    );
  }

  // ---------------------------------------------------------------------------
  // The catalogue and new units — mirrors services/products.ts and the
  // asset endpoints. The catalogue is every product a unit is of, plus the
  // ones made here.

  final _madeProducts = <Product>[];
  var _unitSeq = 0;

  List<Product> get _catalogue {
    final byId = <String, Product>{};
    for (final a in _units) {
      byId[a.product.id] = a.product;
    }
    for (final p in _madeProducts) {
      byId[p.id] = p;
    }
    return byId.values.toList();
  }

  CatalogProductPage _listCatalog(Map<String, dynamic> query) {
    final q = '${query['q'] ?? ''}'.trim();
    final limit = int.tryParse('${query['limit'] ?? ''}') ?? 50;
    final matches = _catalogue.where((p) => q.isEmpty || _matches(p, q)).toList()
      ..sort((a, b) => naturalCompare(a.name, b.name));
    return CatalogProductPage(
      items: [for (final p in matches.take(limit)) _catalogProduct(p)],
      nextCursor: null,
    );
  }

  /// Products marked `notInterchangeable` this session; none are to begin with.
  final _notInterchangeable = <String>{};

  CatalogProduct _catalogProduct(Product p) => CatalogProduct(
    id: p.id,
    name: p.name,
    manufacturerName: p.manufacturerName,
    caption: p.caption,
    category: p.category,
    imageUrl: p.imageUrl,
    cable: p.cable,
    requiresInspection: DemoData.inspectionIntervals.containsKey(p.id),
    inspectionRequired: DemoData.inspectionIntervals.containsKey(p.id),
    isLicense: false,
    notInterchangeable: _notInterchangeable.contains(p.id),
    mainsConnectors: const [],
    units: CatalogProductUnits(
      active: _units.where((a) => a.product.id == p.id).length,
      tracked: 0,
      overdue: 0,
    ),
  );

  /// Only the one switch the app sets; every other field is the web's to edit.
  Response<dynamic> _updateProduct(RequestOptions options, Product product) {
    final body = options.data is Map ? options.data as Map : const {};
    final flag = body['notInterchangeable'];
    if (flag is bool) {
      flag ? _notInterchangeable.add(product.id) : _notInterchangeable.remove(product.id);
    }
    return _ok(options, ProductUpdated(product: _catalogProduct(product), unitsChanged: 0));
  }

  List<Manufacturer> _manufacturers() {
    final counts = <String, int>{};
    for (final p in _catalogue) {
      if (p.manufacturerName case final name?) counts[name] = (counts[name] ?? 0) + 1;
    }
    return [
      for (final MapEntry(key: name, value: count) in counts.entries)
        Manufacturer(id: 'mfr_demo_${name.toLowerCase()}', name: name, productCount: count),
    ]..sort((a, b) => naturalCompare(a.name, b.name));
  }

  /// The demo account may register for its own organization only — the rule
  /// kits and inspections follow here, for the same reason.
  bool _mayRegister(Object? orgId) => orgId == DemoData.nordlicht.id;

  Response<dynamic> _createProduct(RequestOptions options) {
    final body = options.data is Map ? options.data as Map : const {};
    String? text(Object? value) {
      final trimmed = value is String ? value.trim() : '';
      return trimmed.isEmpty ? null : trimmed;
    }

    final name = text(body['name']);
    final manufacturer = text(body['manufacturerName']);
    final category = DemoData.categories.where((c) => c.id == body['categoryId']).firstOrNull;
    if (name == null || category == null) {
      return _error(options, 400, 'invalid_request', 'name and categoryId are required.');
    }
    if (!_mayRegister(body['organizationId'])) {
      return _error(options, 403, 'forbidden', 'Only an admin may add to the catalogue');
    }
    final taken = _catalogue.any(
      (p) =>
          p.name.toLowerCase() == name.toLowerCase() &&
          (p.manufacturerName ?? '').toLowerCase() == (manufacturer ?? '').toLowerCase(),
    );
    if (taken) {
      return _error(
        options,
        409,
        'conflict',
        '${productLabel(manufacturer, name)} is in the catalogue already.',
      );
    }
    final product = Product(
      id: 'prd_demo_new_${_madeProducts.length + 1}',
      name: name,
      manufacturerName: manufacturer,
      caption: text(body['caption']),
      category: category,
    );
    _madeProducts.add(product);
    return _ok(options, product, status: 201);
  }

  /// What a new unit needs, checked as the server checks it; the error to
  /// answer with, or the product, location and kit it is made with.
  ({Response<dynamic>? error, Product? product, Location? location, String? bundleId})
  _unitTarget(RequestOptions options, Map body) {
    Response<dynamic> fail(int status, String code, String message) =>
        _error(options, status, code, message);
    final product = _catalogue.where((p) => p.id == body['productId']).firstOrNull;
    final location = DemoData.locations.where((l) => l.id == body['locationId']).firstOrNull;
    final bundleId = body['bundleId'] as String?;
    if (product == null || location == null) {
      return (
        error: fail(404, 'not_found', 'Product or location not found'),
        product: null,
        location: null,
        bundleId: null,
      );
    }
    if (!_mayRegister(body['organizationId']) ||
        location.organization.id != body['organizationId']) {
      return (
        error: fail(403, 'forbidden', 'Only an admin may register units here'),
        product: null,
        location: null,
        bundleId: null,
      );
    }
    if (bundleId != null && _bundles[bundleId]?.organization.id != body['organizationId']) {
      return (
        error: fail(404, 'not_found', 'Kit not found'),
        product: null,
        location: null,
        bundleId: null,
      );
    }
    return (error: null, product: product, location: location, bundleId: bundleId);
  }

  Asset _newUnit(Product product, Location location, String? tag, String? bundleId) => Asset(
    id: 'asset_demo_new_${++_unitSeq}',
    assetTag: tag,
    serialNumber: null,
    orgIndex: 300 + _unitSeq,
    status: AssetStatus.available,
    product: product,
    location: location,
    organization: location.organization,
    bundleId: bundleId,
    parentAssetId: null,
  );

  Response<dynamic> _createAsset(RequestOptions options) {
    final body = options.data is Map ? options.data as Map : const {};
    final tag = '${body['assetTag'] ?? ''}'.trim();
    if (tag.isEmpty) return _error(options, 400, 'invalid_request', 'assetTag is required.');
    final target = _unitTarget(options, body);
    if (target.error case final error?) return error;
    if (_assets.any((a) => a.assetTag == tag) || _bundles.values.any((b) => b.tag == tag)) {
      return _error(options, 409, 'asset_tag_in_use', 'Tag "$tag" is already in use');
    }
    final asset = _newUnit(target.product!, target.location!, tag, target.bundleId);
    _assets.add(asset);
    _log(asset, 'CREATED', '');
    return _ok(options, asset, status: 201);
  }

  /// Gives an untagged unit the sticker just scanned. It joins the tagged
  /// units, so Lookup finds it by that tag from now on.
  Response<dynamic> _setTag(RequestOptions options, String assetId) {
    final body = options.data is Map ? options.data as Map : const {};
    final tag = '${body['assetTag'] ?? ''}'.trim();
    if (tag.isEmpty) return _error(options, 400, 'invalid_request', 'assetTag is required.');
    final unit = _units.where((a) => a.id == assetId).firstOrNull;
    if (unit == null) return _error(options, 404, 'asset_not_found', 'Unit not found');
    if (!_mayRegister(unit.organization.id)) {
      return _error(options, 403, 'forbidden', 'Only an admin may tag units here');
    }
    if (unit.assetTag != null) {
      return _error(options, 409, 'asset_already_tagged', 'This unit already has a tag');
    }
    if (_assets.any((a) => a.assetTag == tag) || _bundles.values.any((b) => b.tag == tag)) {
      return _error(options, 409, 'asset_tag_in_use', 'Tag "$tag" is already in use');
    }
    final tagged = Asset(
      id: unit.id,
      assetTag: tag,
      serialNumber: unit.serialNumber,
      orgIndex: unit.orgIndex,
      status: unit.status,
      product: unit.product,
      location: unit.location,
      organization: unit.organization,
      bundleId: unit.bundleId,
      parentAssetId: unit.parentAssetId,
    );
    _looseUnits.removeWhere((a) => a.id == unit.id);
    final index = _assets.indexWhere((a) => a.id == unit.id);
    if (index >= 0) {
      _assets[index] = tagged;
    } else {
      _assets.add(tagged);
    }
    return _ok(options, tagged);
  }

  Response<dynamic> _createUntagged(RequestOptions options) {
    final body = options.data is Map ? options.data as Map : const {};
    final count = (body['count'] as num? ?? 0).toInt();
    if (count < 1 || count > 200) {
      return _error(options, 400, 'invalid_request', 'count is 1 to 200.');
    }
    final target = _unitTarget(options, body);
    if (target.error case final error?) return error;
    final made = [
      for (var i = 0; i < count; i++)
        _newUnit(target.product!, target.location!, null, target.bundleId),
    ];
    // With the other untagged units: they have no tag to look up.
    _looseUnits.addAll(made);
    return _ok(options, AssetCreateResult(assets: made), status: 201);
  }

  // ---------------------------------------------------------------------------
  // Kits — mirrors services/bundles.ts. Membership is the unit's `bundleId`,
  // as on the server; the kit itself is a row of its own here.

  late final Map<String, _DemoBundle> _bundles = {
    DemoData.cableKit.id: _DemoBundle(
      id: DemoData.cableKit.id,
      name: DemoData.cableKit.name,
      caption: null,
      tag: DemoData.cableKit.tag,
      categoryName: 'Ton',
      organization: DemoData.nordlicht,
    ),
  };
  var _bundleSeq = 0;

  /// As with inspections: the demo account is a MEMBER on paper, which could
  /// change no kit at all, so it may edit its own organization's.
  bool _mayEditKit(_DemoBundle kit) => kit.organization.id == DemoData.nordlicht.id;

  Response<dynamic> _bundleRoute(RequestOptions options, String method, String path) {
    // ['', 'api', 'v1', 'bundles', id?, sub?, assetId?]
    final parts = path.split('/');
    final body = options.data is Map ? options.data as Map : const {};
    if (parts.length == 4) {
      return method == 'POST'
          ? _createBundle(options, body)
          : _ok(options, _listBundles(options.queryParameters));
    }
    final kit = _bundles[Uri.decodeComponent(parts[4])];
    if (kit == null) return _error(options, 404, 'not_found', 'Kit not found');
    final sub = parts.length > 5 ? parts[5] : null;
    if (method == 'GET' && sub == null) return _ok(options, _bundleDetail(kit));
    if (method == 'GET' && sub == 'loose') {
      return _ok(options, _looseGroups(kit, '${options.queryParameters['q'] ?? ''}'));
    }
    if (!_mayEditKit(kit)) {
      return _error(options, 403, 'forbidden', 'Only an admin may change this kit');
    }
    switch ((method, sub)) {
      case ('POST', 'scans'):
        return _scanIntoBundle(options, kit, body);
      case ('DELETE', 'units') when parts.length > 6:
        final assetId = Uri.decodeComponent(parts[6]);
        final asset = _units.where((a) => a.id == assetId && a.bundleId == kit.id).firstOrNull;
        if (asset == null) return _error(options, 404, 'not_found', 'Not in this kit');
        _putInKit(asset, null);
        return _ok(options, _bundleDetail(kit));
      case ('DELETE', 'bundles') when parts.length > 6:
        final inner = _bundles[Uri.decodeComponent(parts[6])];
        if (inner == null || inner.parentBundleId != kit.id) {
          return _error(options, 404, 'not_found', 'Not in this kit');
        }
        inner.parentBundleId = null;
        return _ok(options, _bundleDetail(kit));
      case ('POST', 'loose'):
        final key = '${body['productId']}|${body['locationId']}';
        final count = (body['count'] as num? ?? 0).toInt();
        if (count < 1) {
          return _error(options, 400, 'invalid_request', 'count must be at least 1.');
        }
        final picked = _untaggedFirst(
          _looseFor(kit).where((a) => '${a.product.id}|${a.location.id}' == key),
        ).take(count).toList();
        for (final asset in picked) {
          _putInKit(asset, kit.id);
        }
        return _ok(options, LooseAddResult(count: picked.length, bundle: _bundleDetail(kit)));
    }
    return _error(options, 404, 'not_found', 'Not available in the demo');
  }

  List<BundleSummary> _listBundles(Map<String, dynamic> query) {
    final orgId = query['organizationId'] as String?;
    final q = '${query['q'] ?? ''}'.trim();
    final kits = _bundles.values.where((kit) {
      if (orgId != null && kit.organization.id != orgId) return false;
      if (q.isEmpty) return true;
      final words = q.toLowerCase().split(RegExp(r'\s+'));
      final text = [
        kit.name,
        kit.caption ?? '',
        kit.tag ?? '',
        for (final a in _units.where((a) => a.bundleId == kit.id))
          '${a.product.manufacturerName ?? ''} ${a.product.name} ${a.assetTag ?? ''}',
      ].join(' ').toLowerCase();
      return words.every(text.contains);
    }).toList()..sort((a, b) => naturalCompare(a.name, b.name));
    return [
      for (final kit in kits)
        BundleSummary(
          id: kit.id,
          name: kit.name,
          caption: kit.caption,
          tag: kit.tag,
          imageUrl: null,
          categoryName: kit.categoryName,
          organizationId: kit.organization.id,
          location: _kitLocation(kit),
          unitCount: _units.where((a) => a.bundleId == kit.id).length,
          parentBundle: _parentRef(kit),
        ),
    ];
  }

  /// The kit [kit] sits inside, as the API names it.
  KitRef? _parentRef(_DemoBundle kit) {
    final parent = _bundles[kit.parentBundleId];
    if (parent == null) return null;
    final name = parent.caption == null ? parent.name : '${parent.name} — ${parent.caption}';
    return KitRef(id: parent.id, name: name, tag: parent.tag);
  }

  Response<dynamic> _createBundle(RequestOptions options, Map body) {
    final name = '${body['name'] ?? ''}'.trim();
    final orgId = '${body['organizationId'] ?? ''}';
    final category = DemoData.categories
        .where((c) => c.id == body['categoryId'])
        .firstOrNull;
    final organization = [
      DemoData.nordlicht,
      DemoData.buehnenwerk,
    ].where((o) => o.id == orgId).firstOrNull;
    if (name.isEmpty || category == null || organization == null) {
      return _error(
        options,
        400,
        'invalid_request',
        'organizationId, name and categoryId are required.',
      );
    }
    String? text(Object? value) {
      final trimmed = value is String ? value.trim() : '';
      return trimmed.isEmpty ? null : trimmed;
    }

    final tag = text(body['tag']);
    final kit = _DemoBundle(
      id: 'bundle_demo_new_${++_bundleSeq}',
      name: name,
      caption: text(body['caption']),
      tag: tag,
      categoryName: category.name,
      organization: organization,
    );
    if (!_mayEditKit(kit)) {
      return _error(options, 403, 'forbidden', 'Only an admin may make a kit');
    }
    if (tag != null &&
        (_bundles.values.any((b) => b.tag == tag) || _assets.any((a) => a.assetTag == tag))) {
      return _error(options, 409, 'conflict', 'The tag $tag is taken.');
    }
    _bundles[kit.id] = kit;
    return _ok(options, _bundleDetail(kit), status: 201);
  }

  Response<dynamic> _scanIntoBundle(RequestOptions options, _DemoBundle kit, Map body) {
    final code = '${body['code'] ?? ''}'.trim();
    if (code.isEmpty) return _error(options, 400, 'invalid_request', 'code is required.');
    final move = body['moveFromOtherBundle'] == true;
    BundleScanResult answer(
      BundleScanOutcome outcome, {
      String? assetId,
      LocationRef? scanned,
      LocationRef? other,
    }) => BundleScanResult(
      outcome: outcome,
      assetId: assetId,
      scannedBundle: scanned,
      otherBundle: other,
      bundle: _bundleDetail(kit),
    );

    // Another kit's sticker puts that kit inside, one level deep.
    if (_bundles.values.where((b) => b.tag == code).firstOrNull case final inner?) {
      final scanned = LocationRef(id: inner.id, name: inner.name);
      if (inner.id == kit.id) {
        return _error(options, 409, 'conflict', 'A bundle cannot go inside itself.');
      }
      if (inner.organization.id != kit.organization.id) {
        return _error(options, 409, 'conflict', 'That bundle belongs to another organization.');
      }
      if (kit.parentBundleId != null) {
        return _error(options, 409, 'conflict', 'This bundle sits inside another one itself.');
      }
      if (_bundles.values.any((b) => b.parentBundleId == inner.id)) {
        return _error(options, 409, 'conflict', '${inner.name} holds bundles of its own.');
      }
      if (inner.parentBundleId == kit.id) {
        return _ok(options, answer(BundleScanOutcome.alreadyIn, scanned: scanned));
      }
      if (_bundles[inner.parentBundleId] case final other? when !move) {
        return _ok(
          options,
          answer(
            BundleScanOutcome.inOtherBundle,
            scanned: scanned,
            other: LocationRef(id: other.id, name: other.name),
          ),
        );
      }
      inner.parentBundleId = kit.id;
      return _ok(options, answer(BundleScanOutcome.added, scanned: scanned));
    }
    final match = _resolve(code);
    if (match.ambiguous) return _ok(options, answer(BundleScanOutcome.ambiguous));
    var asset = match.asset;
    if (asset == null) return _ok(options, answer(BundleScanOutcome.notFound));
    // An accessory's tag puts in the unit it hangs off.
    if (asset.parentAssetId case final parentId?) {
      asset = _units.firstWhere((a) => a.id == parentId);
    }
    if (asset.bundleId == kit.id) {
      return _ok(options, answer(BundleScanOutcome.alreadyIn, assetId: asset.id));
    }
    if (asset.organization.id != kit.organization.id) {
      return _error(options, 403, 'forbidden', 'This unit belongs to another organization');
    }
    if (asset.status == AssetStatus.sold || asset.status == AssetStatus.decommissioned) {
      return _error(options, 409, 'conflict', 'A retired unit goes into no kit.');
    }
    if (asset.bundleId case final otherId? when !move) {
      final other = _bundles[otherId];
      return _ok(
        options,
        answer(
          BundleScanOutcome.inOtherBundle,
          assetId: asset.id,
          other: LocationRef(id: otherId, name: other?.name ?? otherId),
        ),
      );
    }
    _putInKit(asset, kit.id);
    return _ok(options, answer(BundleScanOutcome.added, assetId: asset.id));
  }

  List<LooseGroup> _looseGroups(_DemoBundle kit, String q) {
    if (q.trim().length < 2) return const [];
    final groups = <String, List<Asset>>{};
    for (final a in _looseFor(kit)) {
      if (!_matches(a.product, q)) continue;
      groups.putIfAbsent('${a.product.id}|${a.location.id}', () => []).add(a);
    }
    return [
      for (final MapEntry(:key, value: units) in groups.entries)
        LooseGroup(
          key: key,
          productId: units.first.product.id,
          locationId: units.first.location.id,
          productName: units.first.product.name,
          productCaption: units.first.product.caption,
          productImageUrl: units.first.product.imageUrl,
          manufacturerName: units.first.product.manufacturerName,
          locationName: units.first.location.name,
          available: units.length,
          untagged: units.where((u) => u.assetTag == null).length,
        ),
    ]..sort((a, b) => naturalCompare(a.productName, b.productName));
  }

  /// The kit's organization's units in no kit and not out.
  Iterable<Asset> _looseFor(_DemoBundle kit) => _units.where(
    (a) =>
        a.organization.id == kit.organization.id &&
        a.bundleId == null &&
        a.parentAssetId == null &&
        a.status != AssetStatus.sold &&
        a.status != AssetStatus.decommissioned &&
        !_checkedOutTo.containsKey(a.id),
  );

  BundleDetail _bundleDetail(_DemoBundle kit) {
    final inKit = _units.where((a) => a.bundleId == kit.id).toList();
    final ids = {for (final a in inKit) a.id};
    // Each unit followed by its accessories, as the server lists them.
    final heads = inKit.where((a) => !ids.contains(a.parentAssetId)).toList()
      ..sort((a, b) => naturalCompare(a.product.name, b.product.name));
    final ordered = [
      for (final head in heads) ...[
        head,
        ...inKit.where((a) => a.parentAssetId == head.id),
      ],
    ];
    return BundleDetail(
      id: kit.id,
      name: kit.name,
      caption: kit.caption,
      tag: kit.tag,
      imageUrl: null,
      categoryName: kit.categoryName,
      organizationId: kit.organization.id,
      location: _kitLocation(kit),
      unitCount: inKit.where((a) => !ids.contains(a.parentAssetId)).length,
      parentBundle: _parentRef(kit),
      innerBundles: [
        for (final inner in _bundles.values.where((b) => b.parentBundleId == kit.id))
          InnerBundle(
            id: inner.id,
            name: inner.name,
            caption: inner.caption,
            tag: inner.tag,
            imageUrl: null,
            unitCount: _units
                .where((a) => a.bundleId == inner.id && a.parentAssetId == null)
                .length,
          ),
      ]..sort((a, b) => naturalCompare(a.name, b.name)),
      canEdit: _mayEditKit(kit),
      units: [
        for (final a in ordered)
          BundleUnit(
            id: a.id,
            assetTag: a.assetTag,
            serialNumber: a.serialNumber,
            orgIndex: a.orgIndex ?? 0,
            status: a.status.toJson(),
            parentAssetId: ids.contains(a.parentAssetId) ? a.parentAssetId : null,
            productId: a.product.id,
            lengthCm: a.product.cable?.lengthCm,
            productName: a.product.name,
            productCaption: a.product.caption,
            manufacturerName: a.product.manufacturerName,
            productImageUrl: a.product.imageUrl,
            location: LocationRef(id: a.location.id, name: a.location.name),
            checkedOutTo: _checkedOutTo[a.id]?.name,
          ),
      ],
    );
  }

  /// Where most of the kit is kept; none while it is empty.
  LocationRef? _kitLocation(_DemoBundle kit) {
    final tally = <String, ({Location location, int count})>{};
    for (final a in _units.where((a) => a.bundleId == kit.id)) {
      final seen = tally[a.location.id];
      tally[a.location.id] = (location: a.location, count: (seen?.count ?? 0) + 1);
    }
    if (tally.isEmpty) return null;
    final top = tally.values.reduce((a, b) => b.count > a.count ? b : a).location;
    return LocationRef(id: top.id, name: top.name);
  }

  /// Puts a unit, with its accessories, into a kit — or out of one with null.
  void _putInKit(Asset asset, String? bundleId) {
    for (final unit in [asset, ..._units.where((a) => a.parentAssetId == asset.id)]) {
      final copy = Asset(
        id: unit.id,
        assetTag: unit.assetTag,
        serialNumber: unit.serialNumber,
        orgIndex: unit.orgIndex,
        status: unit.status,
        product: unit.product,
        location: unit.location,
        organization: unit.organization,
        bundleId: bundleId,
        parentAssetId: unit.parentAssetId,
      );
      final index = _assets.indexWhere((a) => a.id == unit.id);
      if (index >= 0) {
        _assets[index] = copy;
      } else {
        final loose = _looseUnits.indexWhere((a) => a.id == unit.id);
        if (loose >= 0) _looseUnits[loose] = copy;
      }
    }
  }

  /// Untagged units first, then by unit number — the order the server takes
  /// a number of one product in.
  static List<Asset> _untaggedFirst(Iterable<Asset> units) => units.toList()
    ..sort((a, b) {
      final byTag = (a.assetTag == null ? 0 : 1).compareTo(b.assetTag == null ? 0 : 1);
      return byTag != 0 ? byTag : (a.orgIndex ?? 0).compareTo(b.orgIndex ?? 0);
    });

  /// Every word of [q] somewhere in the product's full name — a plain stand-in
  /// for the server's forgiving search.
  static bool _matches(Product product, String q) {
    final text = '${product.manufacturerName ?? ''} ${product.name} ${product.caption ?? ''}'
        .toLowerCase();
    return q.trim().toLowerCase().split(RegExp(r'\s+')).every(text.contains);
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
              productCaption: a.product.caption,
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
      productCaption: asset.product.caption,
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
          productCaption: lines.first.product.caption,
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
  Response<dynamic> _ok(RequestOptions options, Object model, {int status = 200}) =>
      Response(
        requestOptions: options,
        statusCode: status,
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

/// A kit held in memory — see `_bundleRoute`.
class _DemoBundle {
  _DemoBundle({
    required this.id,
    required this.name,
    required this.caption,
    required this.tag,
    required this.categoryName,
    required this.organization,
  });

  final String id;
  final String name;
  final String? caption;
  final String? tag;
  final String categoryName;
  final Organization organization;

  /// The kit this one sits inside, one level deep, as on the server.
  String? parentBundleId;
}

/// A production check held in memory — see `_startCheck`.
class _DemoCheck {
  _DemoCheck({required this.id, required this.production}) : createdAt = DateTime.now();

  final String id;
  final Production production;
  final DateTime createdAt;
  bool open = true;

  /// Asset id → how it was ticked (`scan` or `manual`).
  final ticks = <String, String>{};
}
