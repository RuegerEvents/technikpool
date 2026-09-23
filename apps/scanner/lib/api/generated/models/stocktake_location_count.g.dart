// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'stocktake_location_count.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StocktakeLocationCount _$StocktakeLocationCountFromJson(
  Map<String, dynamic> json,
) => StocktakeLocationCount(
  location: StocktakeLocation.fromJson(
    json['location'] as Map<String, dynamic>,
  ),
  expected: (json['expected'] as num).toInt(),
  counted: (json['counted'] as num).toInt(),
  myCount: (json['myCount'] as num?)?.toInt(),
);

Map<String, dynamic> _$StocktakeLocationCountToJson(
  StocktakeLocationCount instance,
) => <String, dynamic>{
  'location': instance.location,
  'expected': instance.expected,
  'counted': instance.counted,
  'myCount': ?instance.myCount,
};
