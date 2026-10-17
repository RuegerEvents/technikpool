// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'inspection_deleted.g.dart';

@JsonSerializable()
class InspectionDeleted {
  const InspectionDeleted({
    required this.assetId,
    required this.nextInspectionDue,
  });
  
  factory InspectionDeleted.fromJson(Map<String, Object?> json) => _$InspectionDeletedFromJson(json);
  
  final String assetId;
  final DateTime? nextInspectionDue;

  Map<String, Object?> toJson() => _$InspectionDeletedToJson(this);
}
