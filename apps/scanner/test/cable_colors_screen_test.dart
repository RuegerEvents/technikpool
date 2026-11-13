import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:technikpool_scanner/demo/demo_api.dart';
import 'package:technikpool_scanner/l10n/generated/app_localizations.dart';
import 'package:technikpool_scanner/screens/cable_colors_screen.dart';
import 'package:technikpool_scanner/state/providers.dart';

/// The legend, in German — the language the warehouse reads it in.
void main() {
  testWidgets('lists each band with its range, headed by the org', (
    tester,
  ) async {
    final container = ProviderContainer(
      overrides: [
        apiClientProvider.overrideWithValue(demoApiClient(DemoBackend())),
      ],
    );
    addTearDown(container.dispose);
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: MaterialApp(
          locale: const Locale('de'),
          localizationsDelegates: S.localizationsDelegates,
          supportedLocales: S.supportedLocales,
          home: const CableColorsScreen(),
        ),
      ),
    );
    await tester.pump(const Duration(seconds: 1));
    await tester.pumpAndSettle();

    expect(find.text('Nordlicht Veranstaltungstechnik'), findsOneWidget);
    expect(find.text('rot'), findsOneWidget);
    expect(find.text('bis 1 m'), findsOneWidget);
    expect(find.text('über 1 bis 3 m'), findsOneWidget);
    expect(find.text('über 10 bis 25 m'), findsOneWidget);
    // An org's own colour keeps its own name.
    expect(find.text('neongrün'), findsOneWidget);
    expect(find.text('Länger als 25 m: keine Farbe'), findsOneWidget);
    // Bühnenwerk marks nothing, so it has no section.
    expect(find.text('Bühnenwerk Hamburg'), findsNothing);
  });
}
