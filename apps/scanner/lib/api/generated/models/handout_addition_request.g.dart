// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'handout_addition_request.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

HandoutAdditionRequest _$HandoutAdditionRequestFromJson(
  Map<String, dynamic> json,
) => HandoutAdditionRequest(
  productId: json['productId'] as String,
  ownerId: json['ownerId'] as String,
  locationId: json['locationId'] as String,
  count: (json['count'] as num).toInt(),
  organizationId: json['organizationId'] as String?,
);

Map<String, dynamic> _$HandoutAdditionRequestToJson(
  HandoutAdditionRequest instance,
) => <String, dynamic>{
  'organizationId': ?instance.organizationId,
  'productId': instance.productId,
  'ownerId': instance.ownerId,
  'locationId': instance.locationId,
  'count': instance.count,
};
