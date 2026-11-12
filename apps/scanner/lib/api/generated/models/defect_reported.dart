// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'asset.dart';

part 'defect_reported.g.dart';

@JsonSerializable()
class DefectReported {
  const DefectReported({
    required this.asset,
    required this.statusChanged,
  });
  
  factory DefectReported.fromJson(Map<String, Object?> json) => _$DefectReportedFromJson(json);
  
  final Asset asset;

  /// The unit was not in that status before.
  final bool statusChanged;

  Map<String, Object?> toJson() => _$DefectReportedToJson(this);
}
