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

  group('stocktake', () {
    const warehouse = 'loc_demo_warehouse';

    Matcher failsWith(String code) => throwsA(
      isA<Object>().having(
        (e) => (unwrapError(e) as ApiException).code,
        'code',
        code,
      ),
    );

    test('a seeded stocktake is open and counts scans', () async {
      final open = await api.stocktake.listStocktakes(status: StocktakeStatus.open);
      expect(open, hasLength(1));
      final id = open.single.id;
      expect(open.single.countingLocations.single.id, warehouse);

      final before = await api.stocktake.getStocktake(stocktakeId: id);
      expect(before.progress.found, 0);

      final found = await api.stocktake.scanIntoStocktake(
        stocktakeId: id,
        body: const StocktakeScanRequest(
          code: '40000001',
          locationId: warehouse,
        ),
      );
      expect(found.outcome, StocktakeScanResultOutcome.found);
      expect(found.item!.foundByMe, isTrue);

      // A second scan changes nothing and says who got there first.
      final again = await api.stocktake.scanIntoStocktake(
        stocktakeId: id,
        body: const StocktakeScanRequest(
          code: '40000001',
          locationId: warehouse,
        ),
      );
      expect(again.outcome, StocktakeScanResultOutcome.already);

      // 40000003 is in the truck, outside this stocktake's scope.
      final elsewhere = await api.stocktake.scanIntoStocktake(
        stocktakeId: id,
        body: const StocktakeScanRequest(
          code: '40000003',
          locationId: warehouse,
        ),
      );
      expect(elsewhere.outcome, StocktakeScanResultOutcome.unexpected);
      expect(elsewhere.item!.unexpectedReason, 'other_location');

      await expectLater(
        api.stocktake.scanIntoStocktake(
          stocktakeId: id,
          body: const StocktakeScanRequest(code: 'nope', locationId: warehouse),
        ),
        failsWith('asset_not_found'),
      );

      final after = await api.stocktake.getStocktake(stocktakeId: id);
      expect(after.progress.found, 1);
      expect(after.progress.unexpected, 1);
    });

    test('ticks by hand, unticks and counts loose products', () async {
      final id = (await api.stocktake.listStocktakes()).single.id;

      final ticked = await api.stocktake.tickStocktakeItems(
        stocktakeId: id,
        body: const StocktakeTickRequest(
          assetIds: ['asset_demo_40000002', 'asset_demo_40000004'],
          locationId: warehouse,
          via: StocktakeTickRequestVia.manual,
        ),
      );
      expect(ticked.ticked, 2);

      await api.stocktake.untickStocktakeItem(
        stocktakeId: id,
        assetId: 'asset_demo_40000004',
      );
      await expectLater(
        api.stocktake.untickStocktakeItem(
          stocktakeId: id,
          assetId: 'asset_demo_40000004',
        ),
        failsWith('stocktake_not_found_yet'),
      );

      final detail = await api.stocktake.getStocktake(stocktakeId: id);
      final cable = detail.products.single;
      await api.stocktake.setStocktakeCount(
        stocktakeId: id,
        body: StocktakeCountRequest(
          productId: cable.productId,
          locationId: warehouse,
          count: 18,
        ),
      );

      final counted = await api.stocktake.getStocktake(stocktakeId: id);
      expect(counted.products.single.counted, 18);
      expect(
        counted.products.single.locations
            .firstWhere((l) => l.location.id == warehouse)
            .myCount,
        18,
      );
      // One unit ticked, eighteen cables counted.
      expect(counted.progress.found, 19);
    });

    test('a count made from a stale number is refused', () async {
      final id = (await api.stocktake.listStocktakes()).single.id;
      final cable = (await api.stocktake.getStocktake(stocktakeId: id))
          .products
          .single;
      await api.stocktake.setStocktakeCount(
        stocktakeId: id,
        body: StocktakeCountRequest(
          productId: cable.productId,
          locationId: warehouse,
          count: 18,
        ),
      );
      // 18 is stored; this device still thinks 17.
      await expectLater(
        api.stocktake.setStocktakeCount(
          stocktakeId: id,
          body: StocktakeCountRequest(
            productId: cable.productId,
            locationId: warehouse,
            count: 18,
            previous: 17,
          ),
        ),
        failsWith('stocktake_count_changed'),
      );
      await api.stocktake.setStocktakeCount(
        stocktakeId: id,
        body: StocktakeCountRequest(
          productId: cable.productId,
          locationId: warehouse,
          count: 19,
          previous: 18,
        ),
      );
      final counted = await api.stocktake.getStocktake(stocktakeId: id);
      expect(counted.products.single.counted, 19);
    });

    test('closing freezes it', () async {
      final id = (await api.stocktake.listStocktakes()).single.id;
      final closed = await api.stocktake.closeStocktake(stocktakeId: id);
      expect(closed.status, StocktakeStatus.closed);
      expect(await api.stocktake.listStocktakes(status: StocktakeStatus.open), isEmpty);

      final detail = await api.stocktake.getStocktake(stocktakeId: id);
      expect(
        detail.items.every((i) => i.state == StocktakeItemState.missing),
        isTrue,
      );
      await expectLater(
        api.stocktake.scanIntoStocktake(
          stocktakeId: id,
          body: const StocktakeScanRequest(
            code: '40000001',
            locationId: warehouse,
          ),
        ),
        failsWith('stocktake_closed'),
      );
    });

    test('previews and starts a new one', () async {
      final preview = await api.stocktake.previewStocktake(
        body: const StocktakeScopeRequest(
          organizationId: 'org_demo_nordlicht',
          categoryIds: ['catg_demo_light'],
        ),
      );
      expect(preview.units, greaterThan(0));
      // The seeded stocktake already counts the warehouse's lights.
      expect(preview.overlaps, isNotEmpty);

      final created = await api.stocktake.createStocktake(
        body: const StocktakeCreateRequest(
          organizationId: 'org_demo_nordlicht',
          name: 'Licht',
          categoryIds: ['catg_demo_light'],
        ),
      );
      expect(created.status, StocktakeStatus.open);
      expect(created.progress.expected, preview.units);
      expect(
        await api.stocktake.listStocktakes(status: StocktakeStatus.open),
        hasLength(2),
      );
    });
  });
}
