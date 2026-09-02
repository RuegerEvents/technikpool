// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'cable_spec.g.dart';

@JsonSerializable()
class CableSpec {
  const CableSpec({
    required this.type,
    required this.connectorA,
    required this.connectorB,
    required this.lengthCm,
  });
  
  factory CableSpec.fromJson(Map<String, Object?> json) => _$CableSpecFromJson(json);
  
  /// The wire rather than the ends — `CAT7`, `2,5 mm²`, `DMX`. Free text,.
  /// not an enum, and null on most cables: what a lead is, is usually said.
  /// completely by its connectors and its length.
  ///
  final String? type;
  final String? connectorA;
  final String? connectorB;

  /// Whole centimetres.
  final int? lengthCm;

  Map<String, Object?> toJson() => _$CableSpecToJson(this);
}
