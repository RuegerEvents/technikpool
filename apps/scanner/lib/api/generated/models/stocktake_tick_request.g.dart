// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'stocktake_tick_request.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StocktakeTickRequest _$StocktakeTickRequestFromJson(
  Map<String, dynamic> json,
) => StocktakeTickRequest(
  assetIds: (json['assetIds'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  locationId: json['locationId'] as String,
  via: StocktakeTickRequestVia.fromJson(json['via'] as String),
);

Map<String, dynamic> _$StocktakeTickRequestToJson(
  StocktakeTickRequest instance,
) => <String, dynamic>{
  'assetIds': instance.assetIds,
  'locationId': instance.locationId,
  'via': instance.via,
};
