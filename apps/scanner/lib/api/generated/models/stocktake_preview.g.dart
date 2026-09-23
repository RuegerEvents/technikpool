// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'stocktake_preview.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StocktakePreview _$StocktakePreviewFromJson(Map<String, dynamic> json) =>
    StocktakePreview(
      units: (json['units'] as num).toInt(),
      looseUnits: (json['looseUnits'] as num).toInt(),
      out: (json['out'] as num).toInt(),
      overlaps: (json['overlaps'] as List<dynamic>)
          .map((e) => StocktakeOverlap.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$StocktakePreviewToJson(StocktakePreview instance) =>
    <String, dynamic>{
      'units': instance.units,
      'looseUnits': instance.looseUnits,
      'out': instance.out,
      'overlaps': instance.overlaps,
    };
