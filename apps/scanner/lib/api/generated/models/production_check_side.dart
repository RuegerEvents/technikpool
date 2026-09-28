// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'production_check_side.g.dart';

@JsonSerializable()
class ProductionCheckSide {
  const ProductionCheckSide({
    required this.organizationId,
    required this.organizationName,
    required this.own,
  });
  
  factory ProductionCheckSide.fromJson(Map<String, Object?> json) => _$ProductionCheckSideFromJson(json);
  
  final String organizationId;
  final String organizationName;

  /// The production's own org — the whole list, and the handover steps.
  final bool own;

  Map<String, Object?> toJson() => _$ProductionCheckSideToJson(this);
}
