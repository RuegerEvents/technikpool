import 'package:flutter_test/flutter_test.dart';
import 'package:technikpool_scanner/api/client.dart';
import 'package:technikpool_scanner/api/generated/export.dart';
import 'package:technikpool_scanner/demo/demo_api.dart';
import 'package:technikpool_scanner/demo/demo_data.dart';

/// The demo is what app-store reviewers see, and it is the one path with no
/// server behind it to catch a mistake — so it gets the tests.
void main() {
  late ApiClient api;

  setUp(() => api = demoApiClient(DemoBackend()));

  test('serves the fixture warehouse', () async {
    expect((await api.identity.getCurrentUser()).organizations, hasLength(2));
    expect(await api.inventory.listLocations(), hasLength(3));
    expect(await api.inventory.listProductions(), hasLength(2));
    expect(await api.inventory.listCategories(), hasLength(3));
    expect((await api.inventory.listAssets()).items, hasLength(DemoData.assets().length));
  });

  test('filters assets by search and category', () async {
    final search = await api.inventory.listAssets(q: 'K2');
    expect(search.items, isNotEmpty);
    expect(search.items.every((a) => a.product.name.contains('K2')), isTrue);

    final lights = await api.inventory.listAssets(categoryId: 'catg_demo_light');
    expect(lights.items.every((a) => a.product.category.id == 'catg_demo_light'), isTrue);
  });

  test('an unknown tag comes back as an ApiException, not a parse failure', () async {
    await expectLater(
      api.inventory.getAssetByTag(tag: '99999999'),
      throwsA(
        isA<Object>().having(
          (e) => (unwrapError(e) as ApiException).code,
          'code',
          'asset_not_found',
        ),
      ),
    );
  });

  test('a scan onto a production is still there on the next lookup', () async {
    final production = (await api.inventory.listProductions()).first;
    final result = await api.scanning.createScan(
      body: ScanRequest(
        assetTag: '40000001',
        targetType: ScanRequestTargetType.production,
        targetId: production.id,
      ),
    );
    expect(result.action, ScanResultAction.checkedOut);
    expect(result.targetName, production.name);

    final detail = await api.inventory.getAssetByTag(tag: '40000001');
    expect(detail.currentProduction?.id, production.id);
    expect(detail.history.first.action, 'CHECKED_OUT');
  });

  test('putting it on a shelf returns it from the production', () async {
    final production = (await api.inventory.listProductions()).first;
    final shelf = (await api.inventory.listLocations()).first;
    await api.scanning.createScan(
      body: ScanRequest(
        assetTag: '40000002',
        targetType: ScanRequestTargetType.production,
        targetId: production.id,
      ),
    );

    final result = await api.scanning.createScan(
      body: ScanRequest(
        assetTag: '40000002',
        targetType: ScanRequestTargetType.location,
        targetId: shelf.id,
      ),
    );
    expect(result.action, ScanResultAction.locationAssigned);
    expect(result.returnedFrom, [production.name]);

    final detail = await api.inventory.getAssetByTag(tag: '40000002');
    expect(detail.currentProduction, isNull);
    expect(detail.location.id, shelf.id);
  });
}
