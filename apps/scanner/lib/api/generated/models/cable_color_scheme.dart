// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'cable_color_band.dart';

part 'cable_color_scheme.g.dart';

@JsonSerializable()
class CableColorScheme {
  const CableColorScheme({
    required this.organizationId,
    required this.bands,
  });
  
  factory CableColorScheme.fromJson(Map<String, Object?> json) => _$CableColorSchemeFromJson(json);
  
  final String organizationId;

  /// Shortest first.
  final List<CableColorBand> bands;

  Map<String, Object?> toJson() => _$CableColorSchemeToJson(this);
}
