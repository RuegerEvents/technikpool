// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'defect_request.g.dart';

@JsonSerializable()
class DefectRequest {
  const DefectRequest({
    required this.code,
    required this.notes,
  });
  
  factory DefectRequest.fromJson(Map<String, Object?> json) => _$DefectRequestFromJson(json);
  
  /// The scanned asset tag, or a serial number.
  final String code;

  /// What is wrong with it.
  final String notes;

  Map<String, Object?> toJson() => _$DefectRequestToJson(this);
}
