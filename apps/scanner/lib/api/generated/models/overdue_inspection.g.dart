// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'overdue_inspection.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

OverdueInspection _$OverdueInspectionFromJson(Map<String, dynamic> json) =>
    OverdueInspection(
      typeId: json['typeId'] as String,
      name: json['name'] as String,
      nameDe: json['nameDe'] as String?,
      count: (json['count'] as num).toInt(),
    );

Map<String, dynamic> _$OverdueInspectionToJson(OverdueInspection instance) =>
    <String, dynamic>{
      'typeId': instance.typeId,
      'name': instance.name,
      'nameDe': ?instance.nameDe,
      'count': instance.count,
    };
