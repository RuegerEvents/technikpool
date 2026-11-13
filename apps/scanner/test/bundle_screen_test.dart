import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:technikpool_scanner/demo/demo_api.dart';
import 'package:technikpool_scanner/demo/demo_data.dart';
import 'package:technikpool_scanner/l10n/generated/app_localizations.dart';
import 'package:technikpool_scanner/scan/scan_settings.dart';
import 'package:technikpool_scanner/screens/bundle_screen.dart';
import 'package:technikpool_scanner/state/providers.dart';

/// A kit's screen: what is in it, a scan that puts a unit in, and loose
/// cables added by name.
void main() {
  Future<void> pumpKit(WidgetTester tester, {bool editing = true}) async {
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
          home: BundleScreen(bundleId: DemoData.cableKit.id, startEditing: editing),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('opens to be looked at, and the pencil turns editing on', (tester) async {
    await pumpKit(tester, editing: false);
    expect(find.text('3 units'), findsOneWidget);
    expect(find.byTooltip('Take out'), findsNothing);
    expect(find.text('Add loose units'), findsNothing);
    expect(find.byType(TextField), findsNothing);

    await tester.tap(find.byTooltip('Edit kit'));
    await tester.pumpAndSettle();
    expect(find.byTooltip('Take out'), findsNWidgets(3));
    expect(find.text('Add loose units'), findsOneWidget);

    await tester.tap(find.byTooltip('Done editing'));
    await tester.pumpAndSettle();
    expect(find.byTooltip('Take out'), findsNothing);
  });

  testWidgets('lists the kit and puts a typed tag in', (tester) async {
    await pumpKit(tester);
    expect(find.text(DemoData.cableKit.name), findsWidgets);
    expect(find.text('3 units'), findsOneWidget);
    expect(find.byTooltip('Take out'), findsNWidgets(3));

    await tester.enterText(find.byType(TextField).first, '40000004');
    await tester.testTextInput.receiveAction(TextInputAction.done);
    await tester.pumpAndSettle();
    expect(find.text('ETC ColorSource PAR is in the kit'), findsOneWidget);
    expect(find.text('4 units'), findsOneWidget);
  });

  testWidgets('adds loose cables by name', (tester) async {
    await pumpKit(tester);
    await tester.tap(find.text('Add loose units'));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField).last, 'schuko');
    await tester.pumpAndSettle(const Duration(milliseconds: 300));
    expect(find.text('Schuko 5 m'), findsOneWidget);
    await tester.tap(find.byTooltip('One more'));
    await tester.pump();
    await tester.tap(find.widgetWithText(FilledButton, 'Add'));
    await tester.pumpAndSettle();
    expect(find.text('2 × Schuko 5 m put in the kit'), findsOneWidget);

    await tester.tapAt(const Offset(10, 10));
    await tester.pumpAndSettle();
    expect(find.text('5 units'), findsOneWidget);
  });
}
