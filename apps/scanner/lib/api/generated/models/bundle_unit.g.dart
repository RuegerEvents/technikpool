// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'bundle_unit.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BundleUnit _$BundleUnitFromJson(Map<String, dynamic> json) => BundleUnit(
  id: json['id'] as String,
  assetTag: json['assetTag'] as String?,
  serialNumber: json['serialNumber'] as String?,
  orgIndex: (json['orgIndex'] as num).toInt(),
  status: json['status'] as String,
  parentAssetId: json['parentAssetId'] as String?,
  productId: json['productId'] as String,
  productName: json['productName'] as String,
  productCaption: json['productCaption'] as String?,
  manufacturerName: json['manufacturerName'] as String?,
  productImageUrl: json['productImageUrl'] as String?,
  location: LocationRef.fromJson(json['location'] as Map<String, dynamic>),
  checkedOutTo: json['checkedOutTo'] as String?,
  lengthCm: (json['lengthCm'] as num?)?.toInt(),
);

Map<String, dynamic> _$BundleUnitToJson(BundleUnit instance) =>
    <String, dynamic>{
      'lengthCm': ?instance.lengthCm,
      'id': instance.id,
      'assetTag': ?instance.assetTag,
      'serialNumber': ?instance.serialNumber,
      'orgIndex': instance.orgIndex,
      'status': instance.status,
      'parentAssetId': ?instance.parentAssetId,
      'productId': instance.productId,
      'productName': instance.productName,
      'productCaption': ?instance.productCaption,
      'manufacturerName': ?instance.manufacturerName,
      'productImageUrl': ?instance.productImageUrl,
      'location': instance.location,
      'checkedOutTo': ?instance.checkedOutTo,
    };
