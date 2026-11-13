import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:technikpool_scanner/api/generated/export.dart';
import 'package:technikpool_scanner/cable_colors.dart';

CableColorBand _band(int max, String? key, {String? name, String? hex}) =>
    CableColorBand(
      maxLengthCm: max,
      paletteKey: key,
      customName: name,
      customHex: hex,
    );

void main() {
  // Sent out of order on purpose: the rule is the smallest bound that fits,
  // not the first band in the list.
  final bands = [_band(300, 'blue'), _band(100, 'red'), _band(500, 'green')];

  group('bandFor', () {
    test('takes the shortest band the length fits in, bounds inclusive', () {
      expect(bandFor(50, bands)?.paletteKey, 'red');
      expect(bandFor(100, bands)?.paletteKey, 'red');
      expect(bandFor(101, bands)?.paletteKey, 'blue');
      expect(bandFor(500, bands)?.paletteKey, 'green');
    });

    test('a longer cable, or one without a length, has none', () {
      expect(bandFor(501, bands), isNull);
      expect(bandFor(null, bands), isNull);
      expect(bandFor(100, const []), isNull);
    });
  });

  group('CableColors', () {
    final colors = CableColors([
      CableColorScheme(organizationId: 'org_a', bands: bands),
      CableColorScheme(
        organizationId: 'org_b',
        bands: [
          _band(1000, 'magenta'),
          _band(2000, null, name: 'neongelb', hex: '#ccff00'),
        ],
      ),
      const CableColorScheme(organizationId: 'org_empty', bands: []),
    ]);

    test('the owner\'s scheme decides', () {
      expect(colors.colorFor('org_a', 1000), isNull);
      expect(colors.colorFor('org_b', 1000)?.paletteKey, 'magenta');
      expect(colors.colorFor('org_unknown', 50), isNull);
      expect(colors.colorFor(null, 50), isNull);
    });

    test('palette, unknown and custom colours', () {
      expect(colors.colorFor('org_a', 50)?.color, const Color(0xFFDC2626));
      // A key this client does not know is drawn grey.
      expect(colors.colorFor('org_b', 900)?.color, const Color(0xFF9CA3AF));
      final own = colors.colorFor('org_b', 1500)!;
      expect(own.customName, 'neongelb');
      expect(own.color, const Color(0xFFCCFF00));
    });

    test('an org without bands has no scheme', () {
      expect(colors.has('org_empty'), isFalse);
      expect(colors.organizationIds, ['org_a', 'org_b']);
      expect(colors.bandsOf('org_a').map((b) => b.maxLengthCm), [
        100,
        300,
        500,
      ]);
    });
  });
}
