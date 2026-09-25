// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'scan_batch_request_target_type.dart';

part 'scan_batch_request.g.dart';

@JsonSerializable()
class ScanBatchRequest {
  const ScanBatchRequest({
    required this.assetIds,
    required this.targetType,
    required this.targetId,
  });
  
  factory ScanBatchRequest.fromJson(Map<String, Object?> json) => _$ScanBatchRequestFromJson(json);
  
  final List<String> assetIds;
  final ScanBatchRequestTargetType targetType;
  final String targetId;

  Map<String, Object?> toJson() => _$ScanBatchRequestToJson(this);
}
