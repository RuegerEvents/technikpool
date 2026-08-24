// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'asset.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

Asset _$AssetFromJson(Map<String, dynamic> json) => Asset(
  id: json['id'] as String,
  status: AssetStatus.fromJson(json['status'] as String),
  product: Product.fromJson(json['product'] as Map<String, dynamic>),
  location: Location.fromJson(json['location'] as Map<String, dynamic>),
  organization: Organization.fromJson(json['organization'] as Map<String, dynamic>),
  assetTag: json['assetTag'] as String?,
  serialNumber: json['serialNumber'] as String?,
  bundleId: json['bundleId'] as String?,
);

Map<String, dynamic> _$AssetToJson(Asset instance) => <String, dynamic>{
  'id': instance.id,
  'assetTag': ?instance.assetTag,
  'serialNumber': ?instance.serialNumber,
  'status': instance.status,
  'product': instance.product,
  'location': instance.location,
  'organization': instance.organization,
  'bundleId': ?instance.bundleId,
};
