// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'production_check_tick_request.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ProductionCheckTickRequest _$ProductionCheckTickRequestFromJson(
  Map<String, dynamic> json,
) => ProductionCheckTickRequest(
  assetIds: (json['assetIds'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
);

Map<String, dynamic> _$ProductionCheckTickRequestToJson(
  ProductionCheckTickRequest instance,
) => <String, dynamic>{'assetIds': instance.assetIds};
