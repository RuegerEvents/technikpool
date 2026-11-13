// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'cable_color_band.g.dart';

@JsonSerializable()
class CableColorBand {
  const CableColorBand({
    required this.maxLengthCm,
    required this.paletteKey,
    required this.customName,
    required this.customHex,
  });
  
  factory CableColorBand.fromJson(Map<String, Object?> json) => _$CableColorBandFromJson(json);
  
  /// Upper bound, inclusive. The band covers every length above the.
  /// next shorter band's bound up to this one.
  ///
  final int maxLengthCm;

  /// One of the fixed tape colours — `red`, `blue`, `green`, `yellow`,.
  /// `white`, `black`, `orange`, `brown`, `grey`, `violet`, `pink`,.
  /// `turquoise` — which the client names in its own language. Null for.
  /// a colour of the organization's own. Not an enum, so a colour added.
  /// later does not break an older client; one it does not know it may.
  /// show as grey.
  ///
  final String? paletteKey;

  /// The organization's own colour's name, when `paletteKey` is null.
  final String? customName;

  /// The organization's own colour as `#rrggbb`, when `paletteKey` is null.
  final String? customHex;

  Map<String, Object?> toJson() => _$CableColorBandToJson(this);
}
