// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'bundle_create_request.g.dart';

@JsonSerializable()
class BundleCreateRequest {
  const BundleCreateRequest({
    required this.organizationId,
    required this.name,
    required this.categoryId,
    this.caption,
    this.tag,
  });
  
  factory BundleCreateRequest.fromJson(Map<String, Object?> json) => _$BundleCreateRequestFromJson(json);
  
  final String organizationId;
  final String name;
  final String categoryId;
  final String? caption;

  /// The sticker on the case. Unique, and not a unit's tag.
  final String? tag;

  Map<String, Object?> toJson() => _$BundleCreateRequestToJson(this);
}
