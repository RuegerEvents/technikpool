import 'package:intl/intl.dart';

import 'api/generated/export.dart';

/// How a cable's structured half is written on screen. The web spells these the
/// same way — `apps/web/src/lib/cable.ts` — and the two have to match, because a
/// warehouse reads one label off a handheld and the other off a packing list.

/// "XLR3 M → XLR3 F". An end nobody has recorded is an em dash rather than a
/// gap: "we don't know" and "there is nothing there" look identical otherwise.
String cableConnectors(CableSpec cable) {
  final a = cable.connectorA?.trim();
  final b = cable.connectorB?.trim();
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
