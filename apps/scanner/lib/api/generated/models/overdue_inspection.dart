// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'overdue_inspection.g.dart';

@JsonSerializable()
class OverdueInspection {
  const OverdueInspection({
    required this.typeId,
    required this.name,
    required this.nameDe,
    required this.count,
  });
  
  factory OverdueInspection.fromJson(Map<String, Object?> json) => _$OverdueInspectionFromJson(json);
  
  final String typeId;
  final String name;
  final String? nameDe;
  final int count;

  Map<String, Object?> toJson() => _$OverdueInspectionToJson(this);
}
