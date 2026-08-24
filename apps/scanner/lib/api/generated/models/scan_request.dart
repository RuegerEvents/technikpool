// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'scan_request_target_type.dart';

part 'scan_request.g.dart';

@JsonSerializable()
class ScanRequest {
  const ScanRequest({
    required this.assetTag,
    required this.targetType,
    required this.targetId,
  });
  
  factory ScanRequest.fromJson(Map<String, Object?> json) => _$ScanRequestFromJson(json);
  
  /// Exactly what the barcode decoded to.
  final String assetTag;
  final ScanRequestTargetType targetType;
  final String targetId;

  Map<String, Object?> toJson() => _$ScanRequestToJson(this);
}
