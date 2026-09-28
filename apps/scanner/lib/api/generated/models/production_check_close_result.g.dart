// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'production_check_close_result.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ProductionCheckCloseResult _$ProductionCheckCloseResultFromJson(
  Map<String, dynamic> json,
) => ProductionCheckCloseResult(
  found: (json['found'] as num).toInt(),
  missing: (json['missing'] as num).toInt(),
);

Map<String, dynamic> _$ProductionCheckCloseResultToJson(
  ProductionCheckCloseResult instance,
) => <String, dynamic>{'found': instance.found, 'missing': instance.missing};
