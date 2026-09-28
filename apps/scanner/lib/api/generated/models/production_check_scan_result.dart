// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'production_check_scan_result_result.dart';

part 'production_check_scan_result.g.dart';

@JsonSerializable()
class ProductionCheckScanResult {
  const ProductionCheckScanResult({
    required this.result,
    required this.assetTag,
    required this.productName,
    required this.ticked,
  });
  
  factory ProductionCheckScanResult.fromJson(Map<String, Object?> json) => _$ProductionCheckScanResultFromJson(json);
  
  final ProductionCheckScanResultResult result;
  final String assetTag;
  final String productName;

  /// Units this scan ticked — the unit and its untagged accessories.
  final int ticked;

  Map<String, Object?> toJson() => _$ProductionCheckScanResultToJson(this);
}
