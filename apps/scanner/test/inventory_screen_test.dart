import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:technikpool_scanner/api/generated/export.dart';
import 'package:technikpool_scanner/demo/demo_api.dart';
import 'package:technikpool_scanner/demo/demo_data.dart';
import 'package:technikpool_scanner/inventory_rows.dart';
import 'package:technikpool_scanner/l10n/generated/app_localizations.dart';
import 'package:technikpool_scanner/screens/inventory_screen.dart';
import 'package:technikpool_scanner/scan/scan_bus.dart';
import 'package:technikpool_scanner/scan/scan_settings.dart';
import 'package:technikpool_scanner/state/providers.dart';

/// The Inventory tab's three groupings, as on the web's Devices page.
void main() {
  // The grouping is remembered in secure storage, which a test has none of.
  FlutterSecureStorage.setMockInitialValues({});

  Future<ProviderContainer> pump(WidgetTester tester, {double height = 3000}) async {
    // Tall enough that every row of the small demo warehouse is built.
    tester.view.physicalSize = Size(800, height);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final container = ProviderContainer(
      overrides: [
        apiClientProvider.overrideWithValue(demoApiClient(DemoBackend())),
        // A handheld with a trigger: no camera button in the way.
        scanSettingsProvider.overrideWithValue(const ScanSettings(mode: ScanMode.hardware)),
        // The demo's helper text names a tag, which the finders would match.
        isDemoProvider.overrideWithValue(false),
      ],
    );
    addTearDown(container.dispose);
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: MaterialApp(
          localizationsDelegates: S.localizationsDelegates,
          supportedLocales: S.supportedLocales,
          home: const InventoryScreen(),
        ),
      ),
    );
    await tester.pump(const Duration(seconds: 1));
    await tester.pumpAndSettle();
    return container;
  }

  testWidgets('the bundle view lists kits beside the loose products', (tester) async {
    await pump(tester);
    expect(find.text(DemoData.cableKit.name), findsOneWidget);
    // The XLR cables are all in the kit, so they have no row of their own.
    expect(find.text('XLR 10 m'), findsNothing);
    expect(find.text('Schuko 5 m'), findsOneWidget);
  });

  testWidgets('all products counts kit members too; all devices is per unit', (
    tester,
  ) async {
    final container = await pump(tester);
    await tester.tap(find.text('All Products'));
    await tester.pump(const Duration(seconds: 1));
    await tester.pumpAndSettle();
    expect(find.text('XLR 10 m'), findsOneWidget);
    expect(find.text(DemoData.cableKit.name), findsNothing);
    expect(container.read(inventoryGroupingProvider).value, InventoryGrouping.products);

    await tester.tap(find.text('All Devices'));
    await tester.pump(const Duration(seconds: 1));
    await tester.pumpAndSettle();
    // Both XLR cables, one row each.
    expect(find.text('XLR 10 m'), findsNWidgets(2));
  });

  testWidgets('a unit without a tag opens its detail from all devices', (tester) async {
    await pump(tester);
    await tester.tap(find.text('All Devices'));
    await tester.pump(const Duration(seconds: 1));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Schuko 5 m').first);
    await tester.pump(const Duration(seconds: 1));
    await tester.pumpAndSettle();
    expect(find.text('#201'), findsWidgets);
    expect(find.text('Lager Hamburg'), findsOneWidget);
  });

  Future<void> settle(WidgetTester tester) async {
    await tester.pump(const Duration(seconds: 1));
    await tester.pumpAndSettle();
  }

  testWidgets('a scan opens its unit, but only while this tab is in front', (tester) async {
    final container = await pump(tester);
    // The scan tab is in front: the scan is not this tab's.
    container.read(scanBusProvider).add('40000001', ScanSource.hardware);
    await settle(tester);
    expect(find.text('History'), findsNothing);

    container.read(activeTabProvider.notifier).select(HomeTab.inventory);
    container.read(scanBusProvider).add('40000002', ScanSource.hardware);
    await settle(tester);
    expect(find.text('40000002'), findsWidgets);
    expect(find.text('History'), findsOneWidget);
  });

  testWidgets("a kit's own sticker opens the kit, and nothing found says so", (
    tester,
  ) async {
    final container = await pump(tester);
    container.read(activeTabProvider.notifier).select(HomeTab.inventory);
    container.read(scanBusProvider).add('49999999', ScanSource.hardware);
    await settle(tester);
    expect(find.textContaining('49999999 · '), findsOneWidget);

    container.read(scanBusProvider).add(DemoData.cableKit.tag, ScanSource.hardware);
    await settle(tester);
    expect(find.text('3 units'), findsOneWidget);
    // Opened to be looked at.
    expect(find.byTooltip('Take out'), findsNothing);
  });

  testWidgets('a tag typed into the search opens its unit', (tester) async {
    await pump(tester);
    await tester.enterText(find.byType(TextField), '40000008');
    await tester.testTextInput.receiveAction(TextInputAction.search);
    await settle(tester);
    expect(find.text('History'), findsOneWidget);
  });

  testWidgets('the filters scroll away and come back', (tester) async {
    await pump(tester, height: 900);
    await tester.tap(find.text('All Devices'));
    await settle(tester);
    double factor() =>
        tester.widget<AnimatedAlign>(find.byType(AnimatedAlign)).heightFactor!;
    expect(factor(), 1);

    await tester.drag(find.byType(ListView), const Offset(0, -300));
    await tester.pumpAndSettle();
    expect(factor(), 0);

    await tester.drag(find.byType(ListView), const Offset(0, 60));
    await tester.pumpAndSettle();
    expect(factor(), 1);
  });

  test('the bundle view sorts kits in among the products', () {
    InventoryProduct counts(String name) => InventoryProduct(
      product: Product(
        id: name,
        name: name,
        manufacturerName: null,
        category: DemoData.categories.first,
      ),
      organizationId: 'org_demo_nordlicht',
      organizationName: 'Nordlicht',
      count: 1,
      available: 1,
      untagged: 0,
    );
    final rows = bundleViewRows(
      [counts('Akku 2'), counts('Zange 10')],
      const [
        BundleSummary(
          id: 'b',
          name: 'Kabelkiste Ton',
          caption: null,
          tag: null,
          imageUrl: null,
          categoryName: 'Ton',
          organizationId: 'org_demo_nordlicht',
          location: null,
          unitCount: 3,
          parentBundle: null,
        ),
      ],
    );
    expect([for (final r in rows) r.sortName], ['Akku 2', 'Kabelkiste Ton', 'Zange 10']);
    expect(rows[1], isA<KitInventoryRow>());
  });
}
