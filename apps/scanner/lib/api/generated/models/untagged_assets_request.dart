// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'untagged_assets_request.g.dart';

@JsonSerializable()
class UntaggedAssetsRequest {
  const UntaggedAssetsRequest({
    required this.organizationId,
    required this.locationId,
    required this.productId,
    required this.count,
    this.bundleId,
  });
  
  factory UntaggedAssetsRequest.fromJson(Map<String, Object?> json) => _$UntaggedAssetsRequestFromJson(json);
  
  final String organizationId;
  final String locationId;
  final String productId;
  final int count;
  final String? bundleId;

  Map<String, Object?> toJson() => _$UntaggedAssetsRequestToJson(this);
}
