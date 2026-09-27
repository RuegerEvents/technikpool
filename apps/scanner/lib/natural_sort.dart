/// Orders names the way the server does: "2m" before "10m", "A-2" before
/// "a-10", "Äpfel" among the As. The web sorts with an ICU collation
/// (`de-u-kn-true`), and Dart has no collator, so this is the part of it a
/// list of product names and asset tags actually exercises: runs of digits
/// compare as numbers, letters ignore case and German accents, and whatever
/// is still tied falls back to the raw strings so the order is total.
int naturalCompare(String a, String b) {
  final chunksA = _chunk.allMatches(_fold(a)).map((m) => m[0]!).toList();
  final chunksB = _chunk.allMatches(_fold(b)).map((m) => m[0]!).toList();
  for (var i = 0; i < chunksA.length && i < chunksB.length; i++) {
    final x = chunksA[i], y = chunksB[i];
    final result = _isDigits(x) && _isDigits(y) ? _compareNumbers(x, y) : x.compareTo(y);
    if (result != 0) return result;
  }
  final byLength = chunksA.length.compareTo(chunksB.length);
  return byLength != 0 ? byLength : a.compareTo(b);
}

final _chunk = RegExp(r'\d+|\D+');

bool _isDigits(String s) => s.codeUnitAt(0) ^ 0x30 < 10;

/// Arbitrarily long runs, so no int.parse: without leading zeros, the longer
/// number is the larger one, and equal lengths compare digit by digit.
int _compareNumbers(String x, String y) {
  final a = x.replaceFirst(_leadingZeros, ''), b = y.replaceFirst(_leadingZeros, '');
  final byLength = a.length.compareTo(b.length);
  return byLength != 0 ? byLength : a.compareTo(b);
}

final _leadingZeros = RegExp(r'^0+');

String _fold(String s) {
  final lower = s.toLowerCase();
  final out = StringBuffer();
  for (final rune in lower.runes) {
    final c = String.fromCharCode(rune);
    out.write(_accents[c] ?? c);
  }
  return out.toString();
}

const _accents = {
  'ä': 'a',
  'à': 'a',
  'á': 'a',
  'â': 'a',
  'å': 'a',
  'ö': 'o',
  'ò': 'o',
  'ó': 'o',
  'ô': 'o',
  'ø': 'o',
  'ü': 'u',
  'ù': 'u',
  'ú': 'u',
  'û': 'u',
  'é': 'e',
  'è': 'e',
  'ê': 'e',
  'ë': 'e',
  'í': 'i',
  'ì': 'i',
  'î': 'i',
  'ï': 'i',
  'ç': 'c',
  'ñ': 'n',
  'ß': 'ss',
};
