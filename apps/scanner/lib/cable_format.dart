import 'package:intl/intl.dart';

import 'api/generated/export.dart';

/// How a cable's structured half is written on screen. The web spells these the
/// same way — `apps/web/src/lib/cable.ts` — and the two have to match, because a
/// warehouse reads one label off a handheld and the other off a packing list.

/// "XLR3 M → XLR3 F". An end nobody has recorded is an em dash rather than a
/// gap: "we don't know" and "there is nothing there" look identical otherwise.
///
/// A loom has no ends of its own — they are its ways — so it answers with what
/// runs through it instead, on one line. That keeps every caller working
/// without asking which kind of cable it is holding.
String cableConnectors(CableSpec cable) {
  if (cable.ways.isNotEmpty) {
    return cable.ways.map(_wayLabel).join(' + ');
  }
  return _ends(cable.connectorA, cable.connectorB);
}

/// A loom's ways, one per line, for a screen with room to list them.
String cableWays(CableSpec cable) => cable.ways
    .map((way) {
      final wire = way.type?.trim();
      return [
        _wayLabel(way),
        if (wire != null && wire.isNotEmpty) wire,
      ].join(' · ');
    })
    .join('\n');

String _wayLabel(CableWay way) {
  final ends = _ends(way.connectorA, way.connectorB);
  return way.count > 1 ? '${way.count}× $ends' : ends;
}

String _ends(String? connectorA, String? connectorB) {
  final a = connectorA?.trim();
  final b = connectorB?.trim();
  if ((a == null || a.isEmpty) && (b == null || b.isEmpty)) return '—';
  return '${a?.isNotEmpty == true ? a : '—'} → ${b?.isNotEmpty == true ? b : '—'}';
}

/// Centimetres → "10 m" / "1,5 m", in the reader's locale. Unlike the web's
/// stored product name — which is fixed to de-DE so it comes out identical
/// whoever typed it — this is display only, so it follows the device.
String? cableLength(CableSpec cable, String localeName) {
  final cm = cable.lengthCm;
  if (cm == null) return null;
  return '${NumberFormat.decimalPattern(localeName).format(cm / 100)} m';
}
