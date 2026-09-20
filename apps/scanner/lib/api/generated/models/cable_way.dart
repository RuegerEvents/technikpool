// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'cable_way.g.dart';

/// One way of a loom. Identical ways are one entry with a count — "6× Schuko.
/// M→F" is a number, not six entries.
///
@JsonSerializable()
class CableWay {
  const CableWay({
    required this.count,
    required this.type,
    required this.connectorA,
    required this.connectorB,
  });
  
  factory CableWay.fromJson(Map<String, Object?> json) => _$CableWayFromJson(json);
  
  final int count;

  /// This way's wire, where a loom's ways differ — `2,5 mm²`, `CAT7`.
  final String? type;
  final String? connectorA;
  final String? connectorB;

  Map<String, Object?> toJson() => _$CableWayToJson(this);
}
