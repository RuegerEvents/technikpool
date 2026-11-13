// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'product_create_request.g.dart';

@JsonSerializable()
class ProductCreateRequest {
  const ProductCreateRequest({
    required this.organizationId,
    required this.name,
    required this.categoryId,
    this.manufacturerName,
    this.caption,
  });
  
  factory ProductCreateRequest.fromJson(Map<String, Object?> json) => _$ProductCreateRequestFromJson(json);
  
  /// The org the units will be for; the right to add is checked there.
  final String organizationId;
  final String name;

  /// Found by name, or made. Absent or blank - no manufacturer.
  final String? manufacturerName;
  final String categoryId;
  final String? caption;

  Map<String, Object?> toJson() => _$ProductCreateRequestToJson(this);
}
