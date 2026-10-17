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
      inspectorName: json['inspectorName'] as String?,
      notes: json['notes'] as String?,
    );

Map<String, dynamic> _$InspectionRequestToJson(InspectionRequest instance) =>
    <String, dynamic>{
      'code': instance.code,
      'performedAt': instance.performedAt,
      'result': instance.result,
      'inspectorName': ?instance.inspectorName,
      'notes': ?instance.notes,
    };
