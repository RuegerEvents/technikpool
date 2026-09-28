// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'production_check_tick_result.g.dart';

@JsonSerializable()
class ProductionCheckTickResult {
  const ProductionCheckTickResult({
    required this.ticked,
  });
  
  factory ProductionCheckTickResult.fromJson(Map<String, Object?> json) => _$ProductionCheckTickResultFromJson(json);
  
  final int ticked;

  Map<String, Object?> toJson() => _$ProductionCheckTickResultToJson(this);
}
