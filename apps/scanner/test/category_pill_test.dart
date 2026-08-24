import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:technikpool_scanner/widgets/category_pill.dart';

/// These two functions are a port of `getContrastingTextColor` and
/// `parseHexColor` in `apps/web/src/lib/utils.ts`. A category has to read the
/// same on a handheld as in the browser, and nothing but a test will notice if
/// one side drifts — so the cases below are the colours actually in the
/// database, not invented ones.
void main() {
  group('parseHexColor', () {
    test('reads six-digit hex', () {
      expect(parseHexColor('#ef4444'), const Color(0xFFEF4444));
    });

    test('expands three-digit hex', () {
      expect(parseHexColor('#fff'), const Color(0xFFFFFFFF));
    });

    test('tolerates surrounding whitespace and any case', () {
      expect(parseHexColor('  #A855F7 '), const Color(0xFFA855F7));
    });

    test('rejects anything else rather than guessing', () {
      for (final input in ['ef4444', '#gggggg', '#ef44', '', 'red']) {
        expect(parseHexColor(input), isNull, reason: input);
      }
    });
  });

  group('contrastingTextColor', () {
    const black = Color(0xFF000000);
    const white = Color(0xFFFFFFFF);

    test('picks black on the light end of the palette', () {
      // Miscellaneous is #ffffff in the database — the case that pushed the
      // pill to carry a hairline border as well as a background.
      expect(contrastingTextColor(const Color(0xFFFFFFFF)), black);
      expect(contrastingTextColor(const Color(0xFFEAB308)), black); // Light
      expect(contrastingTextColor(const Color(0xFF22C55E)), black); // Controller
      expect(contrastingTextColor(const Color(0xFFA3A3A3)), black); // Rigging
      expect(contrastingTextColor(const Color(0xFFF97316)), black); // Audio
    });

    test('picks white on the dark end', () {
      expect(contrastingTextColor(const Color(0xFF000000)), white);
      expect(contrastingTextColor(const Color(0xFFEF4444)), white); // Case
      expect(contrastingTextColor(const Color(0xFF3B82F6)), white); // Network
      expect(contrastingTextColor(const Color(0xFF6B7280)), white); // Power
      expect(contrastingTextColor(const Color(0xFFA855F7)), white); // Video
    });

    test('uses the web\'s 0.3 threshold, not the textbook 0.5', () {
      // #767676 sits at luminance ~0.2, so a 0.5 threshold would call it light
      // and print black on mid grey. The web deliberately favours white here.
      expect(contrastingTextColor(const Color(0xFF767676)), white);
    });
  });
}
