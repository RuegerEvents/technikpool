// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'inspection_result.dart';

part 'inspection_request.g.dart';

@JsonSerializable()
class InspectionRequest {
  const InspectionRequest({
    required this.code,
    required this.performedAt,
    required this.result,
    this.inspectorName,
    this.notes,
  });
  
  factory InspectionRequest.fromJson(Map<String, Object?> json) => _$InspectionRequestFromJson(json);
  
  /// The scanned asset tag, or a serial number.
  final String code;

  /// The day it took place, `YYYY-MM-DD`. Not in the future.
  final String performedAt;
  final InspectionResult result;
  final String? inspectorName;
  final String? notes;

  Map<String, Object?> toJson() => _$InspectionRequestToJson(this);
}
