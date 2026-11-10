// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'category.dart';

part 'category_updated.g.dart';

@JsonSerializable()
class CategoryUpdated {
  const CategoryUpdated({
    required this.category,
    required this.unitsChanged,
  });
  
  factory CategoryUpdated.fromJson(Map<String, Object?> json) => _$CategoryUpdatedFromJson(json);
  
  final Category category;

  /// Units whose inspection interval this change set or cleared.
  final int unitsChanged;

  Map<String, Object?> toJson() => _$CategoryUpdatedToJson(this);
}
