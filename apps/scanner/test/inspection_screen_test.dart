import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:technikpool_scanner/demo/demo_api.dart';
import 'package:technikpool_scanner/l10n/generated/app_localizations.dart';
import 'package:technikpool_scanner/scan/scan_bus.dart';
import 'package:technikpool_scanner/scan/scan_settings.dart';
import 'package:technikpool_scanner/screens/inspection_screen.dart';
import 'package:technikpool_scanner/state/providers.dart';

/// The run's own rules, which no server enforces: the result falls back to
/// "passed" after a failed unit, a unit scanned twice is asked about, and a
/// mistaken one can be taken back.
void main() {
  Future<ProviderContainer> pumpRun(WidgetTester tester) async {
    FlutterSecureStorage.setMockInitialValues({'inspector_name': 'Prüfdienst Nord'});
    final container = ProviderContainer(
      overrides: [
        apiClientProvider.overrideWithValue(demoApiClient(DemoBackend())),
        isDemoProvider.overrideWithValue(false),
        scanSettingsProvider.overrideWithValue(
          const ScanSettings(mode: ScanMode.hardware),
        ),
      ],
    );
    addTearDown(container.dispose);

    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: const MaterialApp(
          localizationsDelegates: S.localizationsDelegates,
          supportedLocales: S.supportedLocales,
          home: InspectionScreen(),
        ),
      ),
    );
    await tester.pumpAndSettle();
    return container;
  }

  Future<void> scan(WidgetTester tester, ProviderContainer container, String code) async {
    container.read(scanBusProvider).add(code, ScanSource.hardware);
    await tester.pumpAndSettle(const Duration(seconds: 1));
  }

  testWidgets('remembers the inspector and ignores scans before the start', (
    tester,
  ) async {
    final container = await pumpRun(tester);
    expect(find.widgetWithText(TextField, 'Prüfdienst Nord'), findsOneWidget);

    await scan(tester, container, '40000001');
    expect(find.text('Martin MAC Aura XB'), findsNothing);

    await tester.tap(find.text('Start inspecting'));
    await tester.pumpAndSettle();
    // Another unit of the same product: the bus would swallow the same code
    // again within its echo window.
    await scan(tester, container, '40000002');
    expect(find.text('Martin MAC Aura XB'), findsOneWidget);
    expect(find.text('1 passed · 0 failed'), findsOneWidget);
  });

  testWidgets('a failed unit is marked broken and the toggle falls back', (tester) async {
    final container = await pumpRun(tester);
    await tester.tap(find.text('Start inspecting'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Failed'));
    await tester.pumpAndSettle();
    expect(find.textContaining('recorded as failed'), findsOneWidget);

    await scan(tester, container, '40000004');
    expect(find.text('Marked broken'), findsOneWidget);
    expect(find.text('0 passed · 1 failed'), findsOneWidget);
    // Back on passed: the hint for a failed scan is gone.
    expect(find.textContaining('recorded as failed'), findsNothing);
  });

  testWidgets('a second scan of the same unit asks first', (tester) async {
    final container = await pumpRun(tester);
    await tester.tap(find.text('Start inspecting'));
    await tester.pumpAndSettle();

    await scan(tester, container, '40000001');
    // By serial number: the same unit, under another code.
    container.read(scanBusProvider).add('MAC-0041', ScanSource.hardware);
    await tester.pumpAndSettle(const Duration(seconds: 1));
    expect(find.text('Already inspected'), findsOneWidget);

    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle(const Duration(seconds: 1));
    expect(find.text('1 passed · 0 failed'), findsOneWidget);
  });

  testWidgets('undo takes it back, and then it may be scanned again', (tester) async {
    final container = await pumpRun(tester);
    await tester.tap(find.text('Start inspecting'));
    await tester.pumpAndSettle();

    await scan(tester, container, '40000001');
    await tester.tap(find.byTooltip('Undo'));
    await tester.pumpAndSettle(const Duration(seconds: 1));
    expect(find.text('Undone'), findsOneWidget);
    expect(find.text('0 passed · 0 failed'), findsOneWidget);

    // Typed rather than scanned: the bus would take a second trigger pull this
    // soon for an echo.
    await tester.enterText(find.byType(TextField), '40000001');
    await tester.testTextInput.receiveAction(TextInputAction.done);
    await tester.pumpAndSettle(const Duration(seconds: 1));
    expect(find.text('Already inspected'), findsNothing);
    expect(find.text('1 passed · 0 failed'), findsOneWidget);
  });
}
