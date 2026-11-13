import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:technikpool_scanner/api/generated/export.dart';
import 'package:technikpool_scanner/demo/demo_api.dart';
import 'package:technikpool_scanner/demo/demo_data.dart';
import 'package:technikpool_scanner/l10n/generated/app_localizations.dart';
import 'package:technikpool_scanner/scan/scan_bus.dart';
import 'package:technikpool_scanner/scan/scan_settings.dart';
import 'package:technikpool_scanner/screens/product_units_screen.dart';
import 'package:technikpool_scanner/state/providers.dart';

/// A product's units open to be looked at: a scan gives no unit a tag until
/// "Tag units" is picked from the ⋮ menu.
void main() {
  testWidgets('a scan tags a unit only in the tagging mode', (tester) async {
    final api = demoApiClient(DemoBackend());
    final container = ProviderContainer(
      overrides: [
        apiClientProvider.overrideWithValue(api),
        scanSettingsProvider.overrideWithValue(const ScanSettings(mode: ScanMode.hardware)),
        // An admin, who may give out tags; the demo account is a MEMBER.
        currentUserProvider.overrideWith(
          (ref) async => CurrentUser(
            user: DemoData.user,
            isAdmin: true,
            organizations: DemoData.currentUser.organizations,
          ),
        ),
      ],
    );
    addTearDown(container.dispose);
    final schuko = (await tester.runAsync(() => api.inventory.listAssets(q: 'Schuko 5')))!
        .items
        .first;

    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: MaterialApp(
          localizationsDelegates: S.localizationsDelegates,
          supportedLocales: S.supportedLocales,
          home: ProductUnitsScreen(
            product: schuko.product,
            organization: schuko.organization,
            locationId: schuko.location.id,
          ),
        ),
      ),
    );
    await tester.pump(const Duration(seconds: 1));
    await tester.pumpAndSettle();
    expect(find.text('12 units · 12 without a tag'), findsOneWidget);

    container.read(scanBusProvider).add('40000300', ScanSource.hardware);
    await tester.pump(const Duration(seconds: 1));
    await tester.pumpAndSettle();
    expect(find.textContaining('Nothing was changed'), findsOneWidget);
    expect(find.text('12 units · 12 without a tag'), findsOneWidget);

    await tester.tap(find.byIcon(Icons.more_vert));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Tag units'));
    await tester.pumpAndSettle();

    container.read(scanBusProvider).add('40000301', ScanSource.hardware);
    await tester.pump(const Duration(seconds: 1));
    await tester.pumpAndSettle();
    expect(find.text('12 units · 11 without a tag'), findsOneWidget);

    await tester.tap(find.byTooltip('Done assigning tags'));
    await tester.pumpAndSettle();
    expect(find.byTooltip('Done assigning tags'), findsNothing);
  });
}
