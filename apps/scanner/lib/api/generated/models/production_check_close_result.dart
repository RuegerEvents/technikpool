// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'production_check_close_result.g.dart';

@JsonSerializable()
class ProductionCheckCloseResult {
  const ProductionCheckCloseResult({
    required this.found,
    required this.missing,
  });
  
  factory ProductionCheckCloseResult.fromJson(Map<String, Object?> json) => _$ProductionCheckCloseResultFromJson(json);
  
  final int found;
  final int missing;

  Map<String, Object?> toJson() => _$ProductionCheckCloseResultToJson(this);
}
