// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'inspection_type.g.dart';

@JsonSerializable()
class InspectionType {
  const InspectionType({
    required this.id,
    required this.key,
    required this.name,
    required this.nameDe,
    required this.sortOrder,
    required this.failStatus,
    required this.requiresQualification,
    required this.hasMeasurements,
    required this.defaultIntervalMonths,
  });
  
  factory InspectionType.fromJson(Map<String, Object?> json) => _$InspectionTypeFromJson(json);
  
  final String id;

  /// `electrical`, `lifting`, `visual` or `calibration` for the types.
  /// every installation has. A type added later gets a key made from.
  /// its name and means nothing special.
  ///
  final String key;

  /// English.
  final String name;

  /// German. Null shows the English name.
  final String? nameDe;
  final int sortOrder;

  /// The status a failed inspection sets the unit to.
  final String failStatus;

  /// Whether recording one takes a qualification for this type.
  final bool requiresQualification;

  /// Whether an inspection of this type carries measured values.
  final bool hasMeasurements;

  /// The interval of an organization that has not set its own.
  final int? defaultIntervalMonths;

  Map<String, Object?> toJson() => _$InspectionTypeToJson(this);
}
