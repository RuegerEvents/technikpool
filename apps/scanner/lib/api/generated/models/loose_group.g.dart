// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'loose_group.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

LooseGroup _$LooseGroupFromJson(Map<String, dynamic> json) => LooseGroup(
  key: json['key'] as String,
  productId: json['productId'] as String,
  locationId: json['locationId'] as String,
  productName: json['productName'] as String,
  productCaption: json['productCaption'] as String?,
  productImageUrl: json['productImageUrl'] as String?,
  manufacturerName: json['manufacturerName'] as String?,
  locationName: json['locationName'] as String,
  available: (json['available'] as num).toInt(),
  untagged: (json['untagged'] as num).toInt(),
);

Map<String, dynamic> _$LooseGroupToJson(LooseGroup instance) =>
    <String, dynamic>{
      'key': instance.key,
      'productId': instance.productId,
      'locationId': instance.locationId,
      'productName': instance.productName,
      'productCaption': ?instance.productCaption,
      'productImageUrl': ?instance.productImageUrl,
      'manufacturerName': ?instance.manufacturerName,
      'locationName': instance.locationName,
      'available': instance.available,
      'untagged': instance.untagged,
    };
