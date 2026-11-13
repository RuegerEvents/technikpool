import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:technikpool_scanner/demo/demo_api.dart';
import 'package:technikpool_scanner/l10n/generated/app_localizations.dart';
import 'package:technikpool_scanner/scan/scan_settings.dart';
import 'package:technikpool_scanner/screens/cable_colors_screen.dart';
import 'package:technikpool_scanner/screens/production_list_screen.dart';
import 'package:technikpool_scanner/state/providers.dart';

/// A production's list carries each unit's owner and length, so a cable's
/// dot follows its owner's scheme.
void main() {
  testWidgets('cables on a hand-out list carry their colour, and the legend '
      'is in the menu', (tester) async {
    tester.view.physicalSize = const Size(800, 3000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final container = ProviderContainer(
      overrides: [
        apiClientProvider.overrideWithValue(demoApiClient(DemoBackend())),
        scanSettingsProvider.overrideWithValue(
          const ScanSettings(mode: ScanMode.hardware),
        ),
      ],
    );
    addTearDown(container.dispose);
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: MaterialApp(
          localizationsDelegates: S.localizationsDelegates,
          supportedLocales: S.supportedLocales,
          home: const ProductionListScreen(
            productionId: 'prdn_demo_festival',
            productionName: 'Festival',
            mode: ProductionListMode.checkout,
          ),
        ),
      ),
    );
    for (var i = 0; i < 3; i++) {
      await tester.pump(const Duration(seconds: 1));
    }

    // Both 10 m XLRs are yellow; the 20 m loom has Nordlicht's own colour.
    expect(find.byTooltip('yellow'), findsNWidgets(2));
    expect(find.byTooltip('neongrün'), findsOneWidget);

    await tester.tap(
      find.descendant(
        of: find.byType(AppBar),
        matching: find.byType(PopupMenuButton<String>),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Cable colours'));
    for (var i = 0; i < 3; i++) {
      await tester.pump(const Duration(seconds: 1));
    }
    expect(find.byType(CableColorsScreen), findsOneWidget);
    // Named as the list names the side it is seen from.
    expect(find.text('Nordlicht'), findsOneWidget);
    expect(find.text('over 5 up to 10 m'), findsOneWidget);

    // Leave, so the list's poll stops before the test ends.
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 1));
  });
}
