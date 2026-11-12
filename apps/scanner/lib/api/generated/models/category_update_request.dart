// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'category_update_request.g.dart';

@JsonSerializable()
class CategoryUpdateRequest {
  const CategoryUpdateRequest({
    this.name,
    this.color,
    this.sortOrder,
    this.requiresInspection,
    this.inspections,
  });
  
  factory CategoryUpdateRequest.fromJson(Map<String, Object?> json) => _$CategoryUpdateRequestFromJson(json);
  
  /// The English source name. Unique.
  final String? name;
  final String? color;
  final int? sortOrder;

  /// The electrical type. Same as `inspections` with its id.
  final bool? requiresInspection;

  /// Inspection type id → whether units in this category need it by default.
  final Map<String, bool>? inspections;

  Map<String, Object?> toJson() => _$CategoryUpdateRequestToJson(this);
}
