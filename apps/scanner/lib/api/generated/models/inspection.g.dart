// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'inspection.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

Inspection _$InspectionFromJson(Map<String, dynamic> json) => Inspection(
  id: json['id'] as String,
  assetId: json['assetId'] as String,
  performedAt: DateTime.parse(json['performedAt'] as String),
  result: InspectionResult.fromJson(json['result'] as String),
  inspectorName: json['inspectorName'] as String?,
  notes: json['notes'] as String?,
  typeId: json['typeId'] as String?,
  externalValue: json['external'] as bool?,
  qualification: json['qualification'] as String?,
);

Map<String, dynamic> _$InspectionToJson(Inspection instance) =>
    <String, dynamic>{
      'id': instance.id,
      'assetId': instance.assetId,
      'typeId': ?instance.typeId,
      'performedAt': instance.performedAt.toIso8601String(),
      'result': instance.result,
      'inspectorName': ?instance.inspectorName,
      'notes': ?instance.notes,
      'external': ?instance.externalValue,
      'qualification': ?instance.qualification,
    };
