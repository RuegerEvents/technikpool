import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:technikpool_scanner/changelog.dart';
import 'package:technikpool_scanner/l10n/generated/app_localizations.dart';
import 'package:technikpool_scanner/screens/whats_new_screen.dart';

/// The changelog is a bundled asset read at runtime, so nothing in the build
/// notices if it stops being declared in pubspec.yaml, stops parsing, or loses
/// one of its two languages — the screen would just sit on its spinner on a
/// device. These check the wiring the compiler cannot.
///
/// `scripts/release-app.mjs` reads the same file to write the App Store's
/// release notes, so a shape it cannot read is a release that cannot be cut.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  // Read once here, outside any widget test: `testWidgets` runs its body in a
  // fake-async zone where a real asset read never completes, so loading it in
  // there hangs rather than fails. The screen gets it as an override.
  late final List<Release> releases;

  setUpAll(() async {
    final container = ProviderContainer();
    addTearDown(container.dispose);
    releases = await container.read(changelogProvider.future);
  });

  test('the bundled changelog parses and is newest first', () {
    expect(releases, isNotEmpty);

    for (final release in releases) {
      expect(
        release.version,
        matches(RegExp(r'^\d+\.\d+\.\d+$')),
        reason: 'every entry names a released version',
      );
      expect(
        release.en,
        isNotEmpty,
        reason: '${release.version} has no English',
      );
      expect(
        release.de,
        isNotEmpty,
        reason: '${release.version} has no German',
      );
    }

    final dates = releases.map((r) => r.date).toList();
    final descending = [...dates]..sort((a, b) => b.compareTo(a));
    expect(dates, descending, reason: 'the newest release is the first entry');
  });

  testWidgets('renders the newest release in the chosen language', (
    tester,
  ) async {
    final newest = releases.first;

    for (final locale in const [Locale('de'), Locale('en')]) {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [changelogProvider.overrideWith((ref) => releases)],
          child: MaterialApp(
            locale: locale,
            localizationsDelegates: S.localizationsDelegates,
            supportedLocales: S.supportedLocales,
            home: const WhatsNewScreen(),
          ),
        ),
      );
      // Not pumpAndSettle: the loading spinner schedules frames for ever, so
      // "settled" never arrives and a failure would hang instead of reporting.
      await tester.pump();
      await tester.pump();

      expect(find.text('Version ${newest.version}'), findsOneWidget);
      expect(
        find.text(newest.notesFor(locale.languageCode).first),
        findsOneWidget,
        reason: 'the ${locale.languageCode} notes are the ones shown',
      );
    }
  });
}
