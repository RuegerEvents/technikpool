// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'stocktake_tick_result.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StocktakeTickResult _$StocktakeTickResultFromJson(Map<String, dynamic> json) =>
    StocktakeTickResult(
      ticked: (json['ticked'] as num).toInt(),
      alreadyFound: (json['alreadyFound'] as num).toInt(),
    );

Map<String, dynamic> _$StocktakeTickResultToJson(
  StocktakeTickResult instance,
) => <String, dynamic>{
  'ticked': instance.ticked,
  'alreadyFound': instance.alreadyFound,
};
