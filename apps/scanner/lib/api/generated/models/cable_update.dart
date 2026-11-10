// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'ways.dart';

part 'cable_update.g.dart';

@JsonSerializable()
class CableUpdate {
  const CableUpdate({
    this.type,
    this.connectorA,
    this.connectorB,
    this.lengthCm,
    this.ways,
  });
  
  factory CableUpdate.fromJson(Map<String, Object?> json) => _$CableUpdateFromJson(json);
  
  /// The wire — `CAT7`, `2,5 mm²`. Usually null.
  final String? type;
  final String? connectorA;
  final String? connectorB;
  final int? lengthCm;

  /// A loom's ways. Leave `connectorA`/`connectorB` null on a loom.
  final List<Ways>? ways;

  Map<String, Object?> toJson() => _$CableUpdateToJson(this);
}
