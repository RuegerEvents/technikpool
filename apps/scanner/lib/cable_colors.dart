import 'dart:ui' show Color;

import 'api/generated/export.dart';
import 'widgets/category_pill.dart' show parseHexColor;

/// Cable colour codes: the tape an organization marks each cable length with.
/// Rules as on the web (`#lib/cable-colors.svelte.ts`): one scheme per org, by
/// length only, and a unit takes its *owner's* scheme, because the tape is
/// stuck to the cable. Nothing about a colour is stored on a unit — it is
/// always worked out from the product's length, so it can never go stale.

/// The fixed tape colours, by the key the server sends. Same hex as the web.
const cableColorPalette = <String, Color>{
  'red': Color(0xFFDC2626),
  'blue': Color(0xFF2563EB),
  'green': Color(0xFF16A34A),
  'yellow': Color(0xFFFACC15),
  'white': Color(0xFFFFFFFF),
  'black': Color(0xFF171717),
  'orange': Color(0xFFF97316),
  'brown': Color(0xFF92400E),
  'grey': Color(0xFF9CA3AF),
  'violet': Color(0xFF7C3AED),
  'pink': Color(0xFFEC4899),
  'turquoise': Color(0xFF14B8A6),
};

/// What a key this client doesn't know yet is drawn as. The spec leaves
/// `paletteKey` open on purpose, so a colour added later still shows.
const _unknown = Color(0xFF9CA3AF);

/// The band a length falls in: the one with the smallest `maxLengthCm` that is
/// at least [lengthCm]. A longer cable, or one without a length, has none.
CableColorBand? bandFor(int? lengthCm, List<CableColorBand> bands) {
  if (lengthCm == null) return null;
  CableColorBand? best;
  for (final band in bands) {
    if (band.maxLengthCm < lengthCm) continue;
    if (best == null || band.maxLengthCm < best.maxLengthCm) best = band;
  }
  return best;
}

/// One band's colour, ready to draw. A palette colour is named by the client
/// in its own language ([paletteKey]); an org's own colour brings its name.
class CableColor {
  const CableColor({required this.color, this.paletteKey, this.customName});

  factory CableColor.of(CableColorBand band) {
    final key = band.paletteKey;
    if (key != null) {
      return CableColor(
        color: cableColorPalette[key] ?? _unknown,
        paletteKey: key,
      );
    }
    return CableColor(
      color: parseHexColor(band.customHex ?? '') ?? _unknown,
      customName: band.customName,
    );
  }

  final Color color;
  final String? paletteKey;
  final String? customName;
}

/// Every scheme the user sees, by organization id.
class CableColors {
  CableColors(Iterable<CableColorScheme> schemes)
    : _bands = {
        for (final scheme in schemes)
          if (scheme.bands.isNotEmpty)
            scheme.organizationId: [...scheme.bands]
              ..sort((a, b) => a.maxLengthCm.compareTo(b.maxLengthCm)),
      };

  static final empty = CableColors(const []);

  final Map<String, List<CableColorBand>> _bands;

  /// The organizations that have a scheme, in the order the server sent them.
  Iterable<String> get organizationIds => _bands.keys;

  bool get isEmpty => _bands.isEmpty;

  /// Whether [organizationId] marks its cables at all — worth asking before
  /// fetching a length just to find out there is no colour for it.
  bool has(String? organizationId) => _bands.containsKey(organizationId);

  /// [organizationId]'s bands, shortest first; empty if it has none.
  List<CableColorBand> bandsOf(String organizationId) =>
      _bands[organizationId] ?? const [];

  /// The colour of a unit owned by [organizationId] whose product is
  /// [lengthCm] long, or null.
  CableColor? colorFor(String? organizationId, int? lengthCm) {
    final bands = _bands[organizationId];
    if (bands == null) return null;
    final band = bandFor(lengthCm, bands);
    return band == null ? null : CableColor.of(band);
  }
}
