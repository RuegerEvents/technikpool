// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'stocktake_create_request.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StocktakeCreateRequest _$StocktakeCreateRequestFromJson(
  Map<String, dynamic> json,
) => StocktakeCreateRequest(
  organizationId: json['organizationId'] as String,
  locationIds: (json['locationIds'] as List<dynamic>?)
      ?.map((e) => e as String)
      .toList(),
  categoryIds: (json['categoryIds'] as List<dynamic>?)
      ?.map((e) => e as String)
      .toList(),
  name: json['name'] as String?,
);

Map<String, dynamic> _$StocktakeCreateRequestToJson(
  StocktakeCreateRequest instance,
) => <String, dynamic>{
  'organizationId': instance.organizationId,
  'locationIds': ?instance.locationIds,
  'categoryIds': ?instance.categoryIds,
  'name': ?instance.name,
};
