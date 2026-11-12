// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'inspection_request.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

InspectionRequest _$InspectionRequestFromJson(Map<String, dynamic> json) =>
    InspectionRequest(
      code: json['code'] as String,
      performedAt: json['performedAt'] as String,
      result: InspectionResult.fromJson(json['result'] as String),
      typeId: json['typeId'] as String?,
      externalValue: json['external'] as bool?,
      inspectorName: json['inspectorName'] as String?,
      qualification: json['qualification'] as String?,
      notes: json['notes'] as String?,
    );

Map<String, dynamic> _$InspectionRequestToJson(InspectionRequest instance) =>
    <String, dynamic>{
      'code': instance.code,
      'performedAt': instance.performedAt,
      'result': instance.result,
      'typeId': ?instance.typeId,
      'external': ?instance.externalValue,
      'inspectorName': ?instance.inspectorName,
      'qualification': ?instance.qualification,
      'notes': ?instance.notes,
    };
