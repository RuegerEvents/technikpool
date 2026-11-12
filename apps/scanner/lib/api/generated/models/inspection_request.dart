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
    this.typeId,
    this.externalValue,
    this.inspectorName,
    this.qualification,
    this.notes,
  });
  
  factory InspectionRequest.fromJson(Map<String, Object?> json) => _$InspectionRequestFromJson(json);
  
  /// The scanned asset tag, or a serial number.
  final String code;

  /// The day it took place, `YYYY-MM-DD`. Not in the future.
  final String performedAt;
  final InspectionResult result;

  /// From listInspectionTypes. Absent - electrical.
  final String? typeId;

  /// Done by an outside firm and only entered here. Then.
  /// `inspectorName` and `qualification` are the firm's, and required.
  /// for a type that needs a qualification. Otherwise the caller must.
  /// hold a qualification for the type in the unit's organization.
  /// (`403 forbidden`), and the inspection is.
  /// recorded under the caller's name.
  ///
  /// The name has been replaced because it contains a keyword. Original name: `external`.
  @JsonKey(name: 'external')
  final bool? externalValue;

  /// The outside firm or inspector. Ignored unless `external`.
  final String? inspectorName;

  /// The outside inspector's qualification. Ignored unless `external`.
  final String? qualification;
  final String? notes;

  Map<String, Object?> toJson() => _$InspectionRequestToJson(this);
}
