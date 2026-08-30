// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'asset_detail.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AssetDetail _$AssetDetailFromJson(Map<String, dynamic> json) => AssetDetail(
  id: json['id'] as String,
  status: AssetStatus.fromJson(json['status'] as String),
  product: Product.fromJson(json['product'] as Map<String, dynamic>),
  location: Location.fromJson(json['location'] as Map<String, dynamic>),
  organization: Organization.fromJson(
    json['organization'] as Map<String, dynamic>,
  ),
  currentProduction: json['currentProduction'] == null
      ? null
      : Production.fromJson(json['currentProduction'] as Map<String, dynamic>),
  history: (json['history'] as List<dynamic>)
      .map((e) => AssetTransaction.fromJson(e as Map<String, dynamic>))
      .toList(),
  assetTag: json['assetTag'] as String?,
  serialNumber: json['serialNumber'] as String?,
  bundleId: json['bundleId'] as String?,
  parentAssetId: json['parentAssetId'] as String?,
);

Map<String, dynamic> _$AssetDetailToJson(AssetDetail instance) =>
    <String, dynamic>{
      'id': instance.id,
      'assetTag': ?instance.assetTag,
      'serialNumber': ?instance.serialNumber,
      'status': instance.status,
      'product': instance.product,
      'location': instance.location,
      'organization': instance.organization,
      'bundleId': ?instance.bundleId,
      'parentAssetId': ?instance.parentAssetId,
      'currentProduction': ?instance.currentProduction,
      'history': instance.history,
    };
