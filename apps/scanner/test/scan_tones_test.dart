import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:technikpool_scanner/scan/scan_tones.dart';

/// A tone whose file is missing fails silently on the device — ScanTones
/// swallows every error on purpose — so the files are checked here instead.
void main() {
  test('every tone has its sound file, bundled as an asset', () {
    final pubspec = File('pubspec.yaml').readAsStringSync();
    expect(pubspec, contains('- assets/sounds/'));
    for (final tone in ScanTone.values) {
      final file = File('assets/${tone.asset}');
      expect(file.existsSync(), isTrue, reason: '${file.path} is missing');
      // A RIFF/WAVE header, so the players can decode it on both platforms.
      final header = String.fromCharCodes(file.readAsBytesSync().take(12));
      expect(header.substring(0, 4), 'RIFF');
      expect(header.substring(8, 12), 'WAVE');
    }
  });

  test('playing without a platform does not throw', () async {
    TestWidgetsFlutterBinding.ensureInitialized();
    ScanTones().play(ScanTone.ok);
    await Future<void>.delayed(const Duration(milliseconds: 50));
  });
}
