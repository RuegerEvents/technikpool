// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'production_handout_tick_request.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ProductionHandoutTickRequest _$ProductionHandoutTickRequestFromJson(
  Map<String, dynamic> json,
) => ProductionHandoutTickRequest(
  assetIds: (json['assetIds'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  done: json['done'] as bool,
);

Map<String, dynamic> _$ProductionHandoutTickRequestToJson(
  ProductionHandoutTickRequest instance,
) => <String, dynamic>{'assetIds': instance.assetIds, 'done': instance.done};
