// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'asset_create_request.g.dart';

@JsonSerializable()
class AssetCreateRequest {
  const AssetCreateRequest({
    required this.productId,
    required this.organizationId,
    required this.locationId,
    required this.assetTag,
  });
  
  factory AssetCreateRequest.fromJson(Map<String, Object?> json) => _$AssetCreateRequestFromJson(json);
  
  final String productId;
  final String organizationId;

  /// One of the organization's locations.
  final String locationId;
  final String assetTag;

  Map<String, Object?> toJson() => _$AssetCreateRequestToJson(this);
}
