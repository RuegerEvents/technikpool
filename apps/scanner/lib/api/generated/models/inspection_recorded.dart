// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'asset.dart';
import 'inspection.dart';

part 'inspection_recorded.g.dart';

@JsonSerializable()
class InspectionRecorded {
  const InspectionRecorded({
    required this.inspection,
    required this.asset,
    required this.inspectionIntervalMonths,
    required this.nextInspectionDue,
    required this.markedBroken,
  });
  
  factory InspectionRecorded.fromJson(Map<String, Object?> json) => _$InspectionRecordedFromJson(json);
  
  final Inspection inspection;
  final Asset asset;
  final int? inspectionIntervalMonths;

  /// The unit's next due date after this inspection. Null when not tracked.
  final DateTime? nextInspectionDue;

  /// The inspection failed and set the unit to `BROKEN`.
  final bool markedBroken;

  Map<String, Object?> toJson() => _$InspectionRecordedToJson(this);
}
