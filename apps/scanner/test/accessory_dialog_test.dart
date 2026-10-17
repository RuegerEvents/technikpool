import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:technikpool_scanner/l10n/generated/app_localizations.dart';
import 'package:technikpool_scanner/widgets/accessory_dialog.dart';

/// The question after a unit with accessories went on a list: everything
/// starts ticked, what is unticked is left out of the answer, and dismissing
/// it answers nothing — which the list reads as "leave them as they are".
void main() {
  Future<Set<String>?> ask(
    WidgetTester tester,
    Future<void> Function() answer,
  ) async {
    Set<String>? result;
    var answered = false;
    await tester.pumpWidget(
      MaterialApp(
        localizationsDelegates: S.localizationsDelegates,
        supportedLocales: S.supportedLocales,
        home: Builder(
          builder: (context) => TextButton(
            onPressed: () async {
              result = await showDialog<Set<String>>(
                context: context,
                builder: (_) => const AccessoryDialog(
                  title: 'Accessories of MAC Aura XB',
                  question: 'Does all of it go along?',
                  accessories: [
                    (assetId: 'a1', name: 'Omega bracket', assetTag: null),
                    (assetId: 'a2', name: 'Power cable', assetTag: '40000099'),
                  ],
                ),
              );
              answered = true;
            },
            child: const Text('open'),
          ),
        ),
      ),
    );
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    await answer();
    await tester.pumpAndSettle();
    expect(answered, isTrue);
    return result;
  }

  testWidgets('confirming at once keeps every accessory', (tester) async {
    final there = await ask(tester, () => tester.tap(find.text('Done')));
    expect(there, {'a1', 'a2'});
  });

  testWidgets('an unticked accessory is left out', (tester) async {
    final there = await ask(tester, () async {
      await tester.tap(find.text('Power cable'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Done'));
    });
    expect(there, {'a1'});
  });

  testWidgets('dismissing answers nothing', (tester) async {
    final there = await ask(tester, () => tester.tapAt(const Offset(5, 5)));
    expect(there, isNull);
  });
}
