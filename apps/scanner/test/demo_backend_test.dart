import 'package:flutter_test/flutter_test.dart';
import 'package:technikpool_scanner/cable_format.dart';
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
    final me = await api.identity.getCurrentUser();
    expect(me.organizations, hasLength(2));
    // The rung travels with the organization, so a client can tell in advance
    // which actions the server will refuse — see MemberOrganization.
    expect(
      me.organizations.every((o) => o.role == MemberOrganizationRole.member),
      isTrue,
    );
    expect(await api.inventory.listLocations(), hasLength(3));
    expect(await api.inventory.listProductions(), hasLength(2));
    expect(await api.inventory.listCategories(), hasLength(3));
    expect(
      (await api.inventory.listAssets()).items,
      hasLength(DemoData.assets().length),
    );
  });

  test('filters assets by search and category', () async {
    final search = await api.inventory.listAssets(q: 'K2');
    expect(search.items, isNotEmpty);
    expect(search.items.every((a) => a.product.name.contains('K2')), isTrue);

    final lights = await api.inventory.listAssets(
      categoryId: 'catg_demo_light',
    );
    expect(
      lights.items.every((a) => a.product.category.id == 'catg_demo_light'),
      isTrue,
    );
  });

  test('a productionId naming nothing is refused, not silently emptied', () async {
    // Listing a production's kit is a read of that production, so the server
    // refuses rather than answering an empty page — a filter narrows a result,
    // it never quietly answers a different question.
    await expectLater(
      api.inventory.listAssets(productionId: 'prdn_does_not_exist'),
      throwsA(
        isA<Object>().having(
          (e) => (unwrapError(e) as ApiException).code,
          'code',
          'production_not_found',
        ),
      ),
    );

    final real = DemoData.productions.first;
    final page = await api.inventory.listAssets(productionId: real.id);
    expect(page.items, isNotNull);
  });

  test('a cable carries its structured half', () async {
    final detail = await api.inventory.getAssetByTag(tag: '40000013');
    expect(detail.product.cable, isNotNull);
    expect(detail.product.cable!.type, 'XLR');
    expect(detail.product.cable!.lengthCm, 1000);
    // Nothing else in the fixture is a cable, so a `cable` on a lamp would mean
    // the mapper is inventing one.
    final lamp = await api.inventory.getAssetByTag(tag: '40000001');
    expect(lamp.product.cable, isNull);
  });

  test('a loom carries its ways instead of a pair of ends', () async {
    final detail = await api.inventory.getAssetByTag(tag: '40000015');
    final cable = detail.product.cable;
    expect(cable, isNotNull);
    // No ends of its own: they are the ways, and something reading the pair
    // would otherwise show a loom as a cable with nothing on either end.
    expect(cable!.connectorA, isNull);
    expect(cable.ways, hasLength(2));
    expect(cable.ways.first.count, 6);
    expect(cableConnectors(cable), '6× Schuko M → Schuko F + XLR3 M → XLR3 F');
    // An ordinary lead has no ways, which is what tells the two apart.
    final xlr = await api.inventory.getAssetByTag(tag: '40000013');
    expect(xlr.product.cable!.ways, isEmpty);
  });

  test(
    'an unknown tag comes back as an ApiException, not a parse failure',
    () async {
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
    },
  );

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

  // A serial number is a fallback for a sticker that has worn off, and it holds
  // only while it picks out one unit — see `resolveScannedCode` on the server.
  test('a serial number resolves when exactly one unit carries it', () async {
    final detail = await api.inventory.getAssetByTag(tag: 'MAC-0041');
    expect(detail.assetTag, '40000001');

    // Case and stray whitespace come off a worn label either way.
    expect(
      (await api.inventory.getAssetByTag(tag: '  mac-0041 ')).assetTag,
      '40000001',
    );
  });

  test('a serial number books the unit it identifies', () async {
    final shelf = (await api.inventory.listLocations()).first;
    final result = await api.scanning.createScan(
      body: ScanRequest(
        assetTag: 'MAC-0043',
        targetType: ScanRequestTargetType.location,
        targetId: shelf.id,
      ),
    );
    expect(result.asset.assetTag, '40000003');
  });

  test('a serial number on two units resolves to neither', () async {
    final assets = DemoData.assets();
    final twins = [
      assets[0],
      Asset(
        id: 'asset_demo_twin',
        assetTag: '40000099',
        serialNumber: assets[0].serialNumber,
        status: assets[0].status,
        product: assets[0].product,
        location: assets[0].location,
        organization: assets[0].organization,
      ),
    ];
    final ambiguous = demoApiClient(DemoBackend(assets: twins));

    await expectLater(
      ambiguous.inventory.getAssetByTag(tag: assets[0].serialNumber!),
      throwsA(
        isA<Object>().having(
          (e) => (unwrapError(e) as ApiException).code,
          'code',
          'serial_ambiguous',
        ),
      ),
    );

    // The printed tag still resolves — it is what disambiguates them.
    expect(
      (await ambiguous.inventory.getAssetByTag(tag: '40000099')).id,
      'asset_demo_twin',
    );
  });
}
