// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'stocktake_scope_request.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StocktakeScopeRequest _$StocktakeScopeRequestFromJson(
  Map<String, dynamic> json,
) => StocktakeScopeRequest(
  organizationId: json['organizationId'] as String,
  locationIds: (json['locationIds'] as List<dynamic>?)
      ?.map((e) => e as String)
      .toList(),
  categoryIds: (json['categoryIds'] as List<dynamic>?)
      ?.map((e) => e as String)
      .toList(),
);

Map<String, dynamic> _$StocktakeScopeRequestToJson(
  StocktakeScopeRequest instance,
) => <String, dynamic>{
  'organizationId': instance.organizationId,
  'locationIds': ?instance.locationIds,
  'categoryIds': ?instance.categoryIds,
};
