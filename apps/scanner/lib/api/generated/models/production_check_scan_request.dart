// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'production_check_scan_request.g.dart';

@JsonSerializable()
class ProductionCheckScanRequest {
  const ProductionCheckScanRequest({
    required this.code,
  });
  
  factory ProductionCheckScanRequest.fromJson(Map<String, Object?> json) => _$ProductionCheckScanRequestFromJson(json);
  
  final String code;

  Map<String, Object?> toJson() => _$ProductionCheckScanRequestToJson(this);
}
