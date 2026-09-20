import 'dart:convert';

import 'package:flutter/services.dart' show rootBundle;
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'state/providers.dart';

/// The release history shown under Settings › What's new.
///
/// It is a bundled asset rather than ARB strings because the entries are
/// *content*, not interface copy: both languages are written in one sitting by
/// whoever cuts the release, and belong next to each other where they can be
/// diffed. Numbering them into app_en.arb and app_de.arb would scatter one
/// release across two files and leave a version half-translated.
///
/// `scripts/release-app.mjs` reads the same file: it refuses to cut a version
/// this list has no entry for, and writes the newest entry into
/// `ios/fastlane/metadata/<locale>/release_notes.txt`. So what the App Store
/// shows and what the app shows cannot drift apart.
class Release {
  const Release({
    required this.version,
    required this.date,
    required this.en,
    required this.de,
  });

  factory Release.fromJson(Map<String, dynamic> json) => Release(
    version: json['version'] as String,
    date: DateTime.parse(json['date'] as String),
    en: (json['en'] as List<dynamic>).cast<String>(),
    de: (json['de'] as List<dynamic>).cast<String>(),
  );

  final String version;
  final DateTime date;
  final List<String> en;
  final List<String> de;

  /// English is the source, so anything we have not been translated into
  /// reads it rather than nothing at all.
  List<String> notesFor(String languageCode) => languageCode == 'de' ? de : en;
}

/// Newest first — the order the file is written in, which is the order it reads.
final changelogProvider = FutureProvider<List<Release>>((ref) async {
  final raw = await rootBundle.loadString('assets/changelog.json');
  return (jsonDecode(raw) as List<dynamic>)
      .map((entry) => Release.fromJson(entry as Map<String, dynamic>))
      .toList();
});

/// The newest release when this device has not been shown it yet, driving the
/// banner on the home screen. Null once it has been read or dismissed.
///
/// A fresh install is announced too. Recording the version silently on first
/// run would read better there, but it would also leave every install that
/// predates the banner waiting one extra release before it ever appears — and
/// "What's new in 1.3.0" on a first launch is a welcome, not a wrong claim.
final unseenReleaseProvider = Provider<Release?>((ref) {
  final releases = ref.watch(changelogProvider).value;
  final seen = ref.watch(seenVersionProvider).value;
  if (releases == null || releases.isEmpty) return null;
  final newest = releases.first;
  return seen == newest.version ? null : newest;
});
