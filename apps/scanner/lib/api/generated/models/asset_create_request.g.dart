// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'asset_create_request.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AssetCreateRequest _$AssetCreateRequestFromJson(Map<String, dynamic> json) =>
    AssetCreateRequest(
      productId: json['productId'] as String,
      organizationId: json['organizationId'] as String,
      locationId: json['locationId'] as String,
      assetTag: json['assetTag'] as String,
    );

Map<String, dynamic> _$AssetCreateRequestToJson(AssetCreateRequest instance) =>
    <String, dynamic>{
      'productId': instance.productId,
      'organizationId': instance.organizationId,
      'locationId': instance.locationId,
      'assetTag': instance.assetTag,
    };
