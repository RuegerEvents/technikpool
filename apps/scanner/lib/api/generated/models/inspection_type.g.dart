// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'inspection_type.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

InspectionType _$InspectionTypeFromJson(Map<String, dynamic> json) =>
    InspectionType(
      id: json['id'] as String,
      key: json['key'] as String,
      name: json['name'] as String,
      nameDe: json['nameDe'] as String?,
      sortOrder: (json['sortOrder'] as num).toInt(),
      failStatus: json['failStatus'] as String,
      requiresQualification: json['requiresQualification'] as bool,
      hasMeasurements: json['hasMeasurements'] as bool,
      defaultIntervalMonths: (json['defaultIntervalMonths'] as num?)?.toInt(),
    );

Map<String, dynamic> _$InspectionTypeToJson(InspectionType instance) =>
    <String, dynamic>{
      'id': instance.id,
      'key': instance.key,
      'name': instance.name,
      'nameDe': ?instance.nameDe,
      'sortOrder': instance.sortOrder,
      'failStatus': instance.failStatus,
      'requiresQualification': instance.requiresQualification,
      'hasMeasurements': instance.hasMeasurements,
      'defaultIntervalMonths': ?instance.defaultIntervalMonths,
    };
