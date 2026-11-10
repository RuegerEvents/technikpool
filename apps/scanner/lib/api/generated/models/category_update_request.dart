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
  });
  
  factory CategoryUpdateRequest.fromJson(Map<String, Object?> json) => _$CategoryUpdateRequestFromJson(json);
  
  /// The English source name. Unique.
  final String? name;
  final String? color;
  final int? sortOrder;
  final bool? requiresInspection;

  Map<String, Object?> toJson() => _$CategoryUpdateRequestToJson(this);
}
