// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'stocktake_count_request.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StocktakeCountRequest _$StocktakeCountRequestFromJson(
  Map<String, dynamic> json,
) => StocktakeCountRequest(
  productId: json['productId'] as String,
  locationId: json['locationId'] as String,
  count: (json['count'] as num).toInt(),
);

Map<String, dynamic> _$StocktakeCountRequestToJson(
  StocktakeCountRequest instance,
) => <String, dynamic>{
  'productId': instance.productId,
  'locationId': instance.locationId,
  'count': instance.count,
};
