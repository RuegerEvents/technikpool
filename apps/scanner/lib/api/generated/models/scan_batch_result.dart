// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'scan_batch_result.g.dart';

@JsonSerializable()
class ScanBatchResult {
  const ScanBatchResult({
    required this.count,
    required this.targetName,
  });
  
  factory ScanBatchResult.fromJson(Map<String, Object?> json) => _$ScanBatchResultFromJson(json);
  
  /// Units booked, accessories taken along included.
  final int count;
  final String targetName;

  Map<String, Object?> toJson() => _$ScanBatchResultToJson(this);
}
