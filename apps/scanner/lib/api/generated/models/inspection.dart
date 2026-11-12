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
    this.typeId,
    this.externalValue,
    this.qualification,
  });
  
  factory Inspection.fromJson(Map<String, Object?> json) => _$InspectionFromJson(json);
  
  final String id;
  final String assetId;

  /// Not required, so an older client keeps compiling.
  final String? typeId;

  /// The day it took place, as midnight UTC.
  final DateTime performedAt;
  final InspectionResult result;

  /// Who inspected it — the user who recorded it, or an outside firm.
  final String? inspectorName;
  final String? notes;

  /// Done by an outside firm and only entered. Not required, so an older client keeps compiling.
  /// The name has been replaced because it contains a keyword. Original name: `external`.
  @JsonKey(name: 'external')
  final bool? externalValue;

  /// The inspector's qualification at the time, e.g. Elektrofachkraft.
  /// Not required, so an older client keeps compiling.
  ///
  final String? qualification;

  Map<String, Object?> toJson() => _$InspectionToJson(this);
}
