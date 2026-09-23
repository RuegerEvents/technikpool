// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'stocktake_overlap.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StocktakeOverlap _$StocktakeOverlapFromJson(Map<String, dynamic> json) =>
    StocktakeOverlap(
      id: json['id'] as String,
      name: json['name'] as String,
      sharedUnits: (json['sharedUnits'] as num).toInt(),
    );

Map<String, dynamic> _$StocktakeOverlapToJson(StocktakeOverlap instance) =>
    <String, dynamic>{
      'id': instance.id,
      'name': instance.name,
      'sharedUnits': instance.sharedUnits,
    };
