// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'handout_addition.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

HandoutAddition _$HandoutAdditionFromJson(Map<String, dynamic> json) =>
    HandoutAddition(
      key: json['key'] as String,
      productId: json['productId'] as String,
      organizationId: json['organizationId'] as String,
      locationId: json['locationId'] as String,
      productName: json['productName'] as String,
      productCaption: json['productCaption'] as String?,
      productImageUrl: json['productImageUrl'] as String?,
      manufacturerName: json['manufacturerName'] as String?,
      locationName: json['locationName'] as String,
      organizationName: json['organizationName'] as String,
      available: (json['available'] as num).toInt(),
      untagged: (json['untagged'] as num).toInt(),
    );

Map<String, dynamic> _$HandoutAdditionToJson(HandoutAddition instance) =>
    <String, dynamic>{
      'key': instance.key,
      'productId': instance.productId,
      'organizationId': instance.organizationId,
      'locationId': instance.locationId,
      'productName': instance.productName,
      'productCaption': ?instance.productCaption,
      'productImageUrl': ?instance.productImageUrl,
      'manufacturerName': ?instance.manufacturerName,
      'locationName': instance.locationName,
      'organizationName': instance.organizationName,
      'available': instance.available,
      'untagged': instance.untagged,
    };
