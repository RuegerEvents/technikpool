// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'untagged_assets_request.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UntaggedAssetsRequest _$UntaggedAssetsRequestFromJson(
  Map<String, dynamic> json,
) => UntaggedAssetsRequest(
  organizationId: json['organizationId'] as String,
  locationId: json['locationId'] as String,
  productId: json['productId'] as String,
  count: (json['count'] as num).toInt(),
  bundleId: json['bundleId'] as String?,
);

Map<String, dynamic> _$UntaggedAssetsRequestToJson(
  UntaggedAssetsRequest instance,
) => <String, dynamic>{
  'organizationId': instance.organizationId,
  'locationId': instance.locationId,
  'productId': instance.productId,
  'count': instance.count,
  'bundleId': ?instance.bundleId,
};
