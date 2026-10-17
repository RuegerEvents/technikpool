// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'inspection_recorded.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

InspectionRecorded _$InspectionRecordedFromJson(
  Map<String, dynamic> json,
) => InspectionRecorded(
  inspection: Inspection.fromJson(json['inspection'] as Map<String, dynamic>),
  asset: Asset.fromJson(json['asset'] as Map<String, dynamic>),
  inspectionIntervalMonths: (json['inspectionIntervalMonths'] as num?)?.toInt(),
  nextInspectionDue: json['nextInspectionDue'] == null
      ? null
      : DateTime.parse(json['nextInspectionDue'] as String),
  markedBroken: json['markedBroken'] as bool,
);

Map<String, dynamic> _$InspectionRecordedToJson(InspectionRecorded instance) =>
    <String, dynamic>{
      'inspection': instance.inspection,
      'asset': instance.asset,
      'inspectionIntervalMonths': ?instance.inspectionIntervalMonths,
      'nextInspectionDue': ?instance.nextInspectionDue?.toIso8601String(),
      'markedBroken': instance.markedBroken,
    };
