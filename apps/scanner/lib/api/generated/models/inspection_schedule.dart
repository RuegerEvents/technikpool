// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'inspection_schedule.g.dart';

@JsonSerializable()
class InspectionSchedule {
  const InspectionSchedule({
    required this.typeId,
    required this.intervalMonths,
    required this.nextDue,
  });
  
  factory InspectionSchedule.fromJson(Map<String, Object?> json) => _$InspectionScheduleFromJson(json);
  
  final String typeId;
  final int intervalMonths;
  final DateTime nextDue;

  Map<String, Object?> toJson() => _$InspectionScheduleToJson(this);
}
