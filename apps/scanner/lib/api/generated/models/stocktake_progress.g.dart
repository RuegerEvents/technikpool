// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'stocktake_progress.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StocktakeProgress _$StocktakeProgressFromJson(Map<String, dynamic> json) =>
    StocktakeProgress(
      expected: (json['expected'] as num).toInt(),
      found: (json['found'] as num).toInt(),
      out: (json['out'] as num).toInt(),
      unexpected: (json['unexpected'] as num).toInt(),
    );

Map<String, dynamic> _$StocktakeProgressToJson(StocktakeProgress instance) =>
    <String, dynamic>{
      'expected': instance.expected,
      'found': instance.found,
      'out': instance.out,
      'unexpected': instance.unexpected,
    };
