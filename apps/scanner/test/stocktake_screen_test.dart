import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:technikpool_scanner/api/generated/export.dart';
import 'package:technikpool_scanner/demo/demo_api.dart';
import 'package:technikpool_scanner/l10n/generated/app_localizations.dart';
import 'package:technikpool_scanner/scan/scan_settings.dart';
import 'package:technikpool_scanner/screens/stocktake_screen.dart';
import 'package:technikpool_scanner/state/providers.dart';

/// The "Open" tab of a stocktake: what is left to find here, narrowed by a
/// search, and the loose products counted by pressing `+`.
void main() {
  Future<ProviderContainer> pumpOpenTab(WidgetTester tester) async {
    final api = demoApiClient(DemoBackend());
    final container = ProviderContainer(
      overrides: [
        apiClientProvider.overrideWithValue(api),
        scanSettingsProvider.overrideWithValue(const ScanSettings(mode: ScanMode.hardware)),
      ],
    );
    addTearDown(container.dispose);

    // The demo answers after a real delay, which a test's fake clock never
    // reaches on its own.
    final open = await tester.runAsync(
      () => api.stocktake.listStocktakes(status: StocktakeStatus.open),
    );
    final stocktake = open!.single;

    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: MaterialApp(
          localizationsDelegates: S.localizationsDelegates,
          supportedLocales: S.supportedLocales,
          home: StocktakeScreen(
            stocktakeId: stocktake.id,
            location: stocktake.countingLocations.single,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Open here'));
    await tester.pumpAndSettle();
    return container;
  }

  testWidgets('the search narrows the open list', (tester) async {
    await pumpOpenTab(tester);

    final before = find.byIcon(Icons.check_box_outline_blank).evaluate().length;
    expect(before, greaterThan(1));

    // One tagged loom carries Schuko ends; the loose 5 m cable does too.
    await tester.enterText(find.byType(TextField).last, 'schuko');
    await tester.pumpAndSettle();
    expect(find.byIcon(Icons.check_box_outline_blank), findsOneWidget);
    expect(find.text('6× Schuko + DMX 20 m'), findsOneWidget);
    expect(find.text('Schuko 5 m'), findsOneWidget);

    // Every word has to match somewhere in the row — tag included.
    await tester.enterText(find.byType(TextField).last, 'schuko dmx');
    await tester.pumpAndSettle();
    expect(find.byIcon(Icons.check_box_outline_blank), findsOneWidget);
    expect(find.text('Schuko 5 m'), findsNothing);

    await tester.enterText(find.byType(TextField).last, 'nothing like it');
    await tester.pumpAndSettle();
    expect(find.byIcon(Icons.check_box_outline_blank), findsNothing);
    expect(find.text('Nothing open here matches.'), findsOneWidget);
    expect(find.text('Schuko 5 m'), findsNothing);
  });

  testWidgets('pressing + counts one more each time', (tester) async {
    await pumpOpenTab(tester);
    await tester.dragUntilVisible(
      find.text('Schuko 5 m'),
      find.byType(ListView),
      const Offset(0, -300),
    );
    await tester.pumpAndSettle();

    expect(find.text('–'), findsOneWidget);
    await tester.tap(find.byIcon(Icons.add));
    await tester.pumpAndSettle();
    expect(find.text('1'), findsOneWidget);

    await tester.tap(find.byIcon(Icons.add));
    await tester.pumpAndSettle();
    expect(find.text('2'), findsOneWidget);
    // Sent once the taps stop, as one write for both.
    await tester.pump(const Duration(seconds: 1));
    await tester.pumpAndSettle();
    expect(find.text('2'), findsOneWidget);
    expect(find.text('20 expected here · 2 counted in total'), findsOneWidget);
  });
}
