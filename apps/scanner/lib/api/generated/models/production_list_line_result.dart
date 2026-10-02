// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'production_list_line_result.g.dart';

@JsonSerializable()
class ProductionListLineResult {
  const ProductionListLineResult({
    required this.done,
  });
  
  factory ProductionListLineResult.fromJson(Map<String, Object?> json) => _$ProductionListLineResultFromJson(json);
  
  final int done;

  Map<String, Object?> toJson() => _$ProductionListLineResultToJson(this);
}
