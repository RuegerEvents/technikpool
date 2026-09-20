import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:technikpool_scanner/demo/demo_api.dart';
import 'package:technikpool_scanner/l10n/generated/app_localizations.dart';
import 'package:technikpool_scanner/scan/scan_bus.dart';
import 'package:technikpool_scanner/scan/scan_settings.dart';
import 'package:technikpool_scanner/screens/lookup_screen.dart';
import 'package:technikpool_scanner/state/providers.dart';

/// The field and the result below it have to describe the same unit. A scan
/// reaches this screen without touching the text field, which is how the box
/// came to sit there showing a tag nobody was looking at any more.
void main() {
  Future<ProviderContainer> pumpLookup(WidgetTester tester) async {
    final container = ProviderContainer(
      overrides: [
        apiClientProvider.overrideWithValue(demoApiClient(DemoBackend())),
        // The demo's helper text names a tag to type, which would otherwise
        // match the finders below.
        isDemoProvider.overrideWithValue(false),
        // A handheld with a trigger: no camera button to find.
        scanSettingsProvider.overrideWithValue(
          const ScanSettings(mode: ScanMode.hardware),
        ),
      ],
    );
    addTearDown(container.dispose);
    container.read(activeTabProvider.notifier).select(HomeTab.lookup);

    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: const MaterialApp(
          localizationsDelegates: S.localizationsDelegates,
          supportedLocales: S.supportedLocales,
          home: LookupScreen(),
        ),
      ),
    );
    await tester.pumpAndSettle();
    return container;
  }

  String fieldText(WidgetTester tester) =>
      tester.widget<TextField>(find.byType(TextField)).controller!.text;

  testWidgets('a scan replaces a value left in the field', (tester) async {
    final container = await pumpLookup(tester);

    await tester.enterText(find.byType(TextField), '40000099');
    await tester.pump();
    expect(fieldText(tester), '40000099');

    container.read(scanBusProvider).add('40000001', ScanSource.hardware);
    await tester.pumpAndSettle(const Duration(seconds: 1));

    expect(fieldText(tester), '40000001');
  });

  testWidgets('a scanned serial number shows as scanned', (tester) async {
    final container = await pumpLookup(tester);

    // Resolving by serial still echoes the code that was scanned, not the tag
    // it resolved to — the field says what the trigger read.
    container.read(scanBusProvider).add('MAC-0041', ScanSource.hardware);
    await tester.pumpAndSettle(const Duration(seconds: 1));

    expect(fieldText(tester), 'MAC-0041');
  });

  testWidgets('a typed code is left with the cursor at its end', (
    tester,
  ) async {
    await pumpLookup(tester);

    await tester.enterText(find.byType(TextField), '  40000002  ');
    await tester.testTextInput.receiveAction(TextInputAction.search);
    await tester.pumpAndSettle(const Duration(seconds: 1));

    // Trimmed, because that is what was looked up.
    expect(fieldText(tester), '40000002');
    final field = tester.widget<TextField>(find.byType(TextField));
    expect(field.controller!.selection.baseOffset, '40000002'.length);
  });
}
