// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'loose_add_request.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

LooseAddRequest _$LooseAddRequestFromJson(Map<String, dynamic> json) =>
    LooseAddRequest(
      productId: json['productId'] as String,
      locationId: json['locationId'] as String,
      count: (json['count'] as num).toInt(),
    );

Map<String, dynamic> _$LooseAddRequestToJson(LooseAddRequest instance) =>
    <String, dynamic>{
      'productId': instance.productId,
      'locationId': instance.locationId,
      'count': instance.count,
    };
