import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:technikpool_scanner/l10n/generated/app_localizations_de.dart';
import 'package:technikpool_scanner/l10n/generated/app_localizations_en.dart';
import 'package:technikpool_scanner/l10n/labels.dart';

/// `AssetTransaction.action` is free text on the wire, so nothing fails when
/// the server learns a new one and the app doesn't — it just renders
/// `ADDED_TO_PRODUCTION` in the history, which is how ten of them accumulated
/// unnoticed. The web's union is the list, so the test reads it rather than
/// keeping a second copy here to drift in its own right.
void main() {
  final union = File('../web/src/lib/types/asset-transaction.ts');

  test('every action the server can write has a label', () {
    expect(
      union.existsSync(),
      isTrue,
      reason: 'expected the web union at ${union.path} — has it moved?',
    );

    final actions = RegExp(r"type:\s*'([A-Z_]+)'")
        .allMatches(union.readAsStringSync())
        .map((m) => m.group(1)!)
        .toSet();

    // A sanity floor: if the regex stops matching, an empty set would make
    // every assertion below pass without checking anything.
    expect(actions, contains('ADDED_TO_PRODUCTION'));
    expect(actions.length, greaterThanOrEqualTo(15));

    for (final locale in [SEn(), SDe()]) {
      for (final action in actions) {
        expect(
          Labels.transactionAction(locale, action),
          isNot(action),
          reason:
              '$action falls through to the raw value in ${locale.localeName}',
        );
      }
    }
  });

  test('an action we have never heard of still shows itself', () {
    expect(Labels.transactionAction(SEn(), 'TELEPORTED'), 'TELEPORTED');
  });
}
