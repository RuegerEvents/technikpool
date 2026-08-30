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
  DemoBackend() : _assets = DemoData.assets();

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
      return _ok(options, _listAssets(options));
    }
    if (method == 'GET' && path.startsWith('/api/v1/assets/by-tag/')) {
      return _byTag(options, Uri.decodeComponent(path.split('/').last));
    }
    if (method == 'POST' && path == '/api/v1/scans') {
      return _scan(options);
    }

    return _error(options, 404, 'not_found', 'Not available in the demo');
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
      return '${asset.product.manufacturerName} ${asset.product.name} '
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
    final asset = _find(tag);
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
      return _error(options, 400, 'invalid_request', 'assetTag and target are required');
    }
    final assetTag = '${body['assetTag'] ?? ''}'.trim();
    final targetId = '${body['targetId'] ?? ''}';
    final targetType = body['targetType'];
    final toProduction = targetType is ScanRequestTargetType
        ? targetType == ScanRequestTargetType.production
        : targetType == 'production';

    if (assetTag.isEmpty || targetId.isEmpty) {
      return _error(options, 400, 'invalid_request', 'assetTag and target are required');
    }

    final asset = _find(assetTag);
    if (asset == null) {
      return _error(options, 404, 'asset_not_found', 'Tag "$assetTag" not found');
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

  Asset? _find(String tag) {
    final wanted = tag.trim();
    for (final asset in _assets) {
      if (asset.assetTag == wanted) return asset;
    }
    return null;
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

  /// A generated `toJson` is shallow — nested models come back as model
  /// instances, not maps — so serialise for real and decode it again. That is
  /// what a socket would have delivered, and it means `fromJson` on the other
  /// side is exercised exactly as it is against the server.
  Response<dynamic> _ok(RequestOptions options, Object model) => Response(
    requestOptions: options,
    statusCode: 200,
    data: jsonDecode(jsonEncode(model, toEncodable: (value) => (value as dynamic).toJson())),
  );

  Response<dynamic> _error(RequestOptions options, int status, String code, String message) =>
      Response(
        requestOptions: options,
        statusCode: status,
        data: {
          'error': {'code': code, 'message': message},
        },
      );
}

/// An [ApiClient] wired to a [DemoBackend] instead of the network.
ApiClient demoApiClient(DemoBackend backend) =>
    ApiClient(baseUrl: demoBaseUrl, dio: backend.dio());
