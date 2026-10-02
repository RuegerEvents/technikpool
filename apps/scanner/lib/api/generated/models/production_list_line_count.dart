// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'production_list_line_count.g.dart';

@JsonSerializable()
class ProductionListLineCount {
  const ProductionListLineCount({
    required this.key,
    required this.count,
  });
  
  factory ProductionListLineCount.fromJson(Map<String, Object?> json) => _$ProductionListLineCountFromJson(json);
  
  final String key;
  final int count;

  Map<String, Object?> toJson() => _$ProductionListLineCountToJson(this);
}
