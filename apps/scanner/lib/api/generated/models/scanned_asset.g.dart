// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'scanned_asset.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ScannedAsset _$ScannedAssetFromJson(Map<String, dynamic> json) => ScannedAsset(
  id: json['id'] as String,
  assetTag: json['assetTag'] as String,
  productName: json['productName'] as String,
  manufacturerName: json['manufacturerName'] as String?,
  productCaption: json['productCaption'] as String?,
);

Map<String, dynamic> _$ScannedAssetToJson(ScannedAsset instance) =>
    <String, dynamic>{
      'id': instance.id,
      'assetTag': instance.assetTag,
      'productName': instance.productName,
      'manufacturerName': ?instance.manufacturerName,
      'productCaption': ?instance.productCaption,
    };
