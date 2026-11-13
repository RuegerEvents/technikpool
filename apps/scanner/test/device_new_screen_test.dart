import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:technikpool_scanner/demo/demo_api.dart';
import 'package:technikpool_scanner/l10n/generated/app_localizations.dart';
import 'package:technikpool_scanner/scan/scan_settings.dart';
import 'package:technikpool_scanner/screens/device_new_screen.dart';
import 'package:technikpool_scanner/state/providers.dart';

/// Registering new devices: a product from the catalogue, then one unit per
/// label, or a number without one.
void main() {
  // The demo answers after a delay, and nothing on this screen animates while
  // it waits, so pumpAndSettle alone would not move the clock on.
  Future<void> settle(WidgetTester tester) async {
    await tester.pump(const Duration(seconds: 1));
    await tester.pumpAndSettle();
  }

  Future<void> pump(WidgetTester tester) async {
    final container = ProviderContainer(
      overrides: [
        apiClientProvider.overrideWithValue(demoApiClient(DemoBackend())),
        scanSettingsProvider.overrideWithValue(const ScanSettings(mode: ScanMode.hardware)),
      ],
    );
    addTearDown(container.dispose);
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: MaterialApp(
          localizationsDelegates: S.localizationsDelegates,
          supportedLocales: S.supportedLocales,
          home: const DeviceNewScreen(),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('a scan before a product is picked says so', (tester) async {
    await pump(tester);
    await tester.enterText(
      find.widgetWithText(TextField, 'Enter label or serial number by hand'),
      '40000200',
    );
    await tester.testTextInput.receiveAction(TextInputAction.done);
    await settle(tester);
    expect(find.text('Pick a product first.'), findsOneWidget);
  });

  testWidgets('picks a product and registers by label and without one', (tester) async {
    await pump(tester);
    final list = find
        .descendant(of: find.byType(ListView), matching: find.byType(Scrollable))
        .first;
    await tester.enterText(find.widgetWithText(TextField, 'Search the catalogue'), 'xlr');
    await tester.pumpAndSettle(const Duration(milliseconds: 300));
    await tester.tap(find.text('XLR 10 m'));
    await tester.pumpAndSettle();
    expect(find.text('Change'), findsOneWidget);

    await tester.enterText(
      find.widgetWithText(TextField, 'Enter label or serial number by hand'),
      '40000200',
    );
    await tester.testTextInput.receiveAction(TextInputAction.done);
    await settle(tester);
    expect(find.text('40000200 registered'), findsOneWidget);
    await tester.scrollUntilVisible(find.text('Registered (1)'), 200, scrollable: list);
    expect(find.text('Registered (1)'), findsOneWidget);
    // The product is what the units were made with now.
    expect(find.text('Change'), findsNothing);
    await tester.scrollUntilVisible(find.text('Without label'), -200, scrollable: list);

    await tester.tap(find.text('Without label'));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('One more'));
    await tester.pump();
    await tester.tap(find.text('Register 2 units'));
    await settle(tester);
    await tester.scrollUntilVisible(find.text('Registered (2)'), 200, scrollable: list);
    expect(find.text('2 × without label'), findsWidgets);
  });
}
