// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'inspection_schedule.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

InspectionSchedule _$InspectionScheduleFromJson(Map<String, dynamic> json) =>
    InspectionSchedule(
      typeId: json['typeId'] as String,
      intervalMonths: (json['intervalMonths'] as num).toInt(),
      nextDue: DateTime.parse(json['nextDue'] as String),
    );

Map<String, dynamic> _$InspectionScheduleToJson(InspectionSchedule instance) =>
    <String, dynamic>{
      'typeId': instance.typeId,
      'intervalMonths': instance.intervalMonths,
      'nextDue': instance.nextDue.toIso8601String(),
    };
