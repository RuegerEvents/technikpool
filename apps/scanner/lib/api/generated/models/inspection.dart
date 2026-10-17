// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'inspection_result.dart';

part 'inspection.g.dart';

@JsonSerializable()
class Inspection {
  const Inspection({
    required this.id,
    required this.assetId,
    required this.performedAt,
    required this.result,
    required this.inspectorName,
    required this.notes,
  });
  
  factory Inspection.fromJson(Map<String, Object?> json) => _$InspectionFromJson(json);
  
  final String id;
  final String assetId;

  /// The day it took place, as midnight UTC.
  final DateTime performedAt;
  final InspectionResult result;

  /// Who inspected it — often an outside firm, not a user.
  final String? inspectorName;
  final String? notes;

  Map<String, Object?> toJson() => _$InspectionToJson(this);
}
