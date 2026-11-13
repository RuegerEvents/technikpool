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
    this.bundleId,
  });
  
  factory AssetCreateRequest.fromJson(Map<String, Object?> json) => _$AssetCreateRequestFromJson(json);
  
  final String productId;
  final String organizationId;

  /// One of the organization's locations.
  final String locationId;
  final String assetTag;

  /// A kit of the same organization to put the unit straight into. Its.
  /// own location wins over `locationId`, and the unit has to fit its.
  /// bundle type. Not required, so an older client keeps compiling.
  ///
  final String? bundleId;

  Map<String, Object?> toJson() => _$AssetCreateRequestToJson(this);
}
