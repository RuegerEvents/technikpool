// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'scan_result_action.dart';
import 'scanned_asset.dart';

part 'scan_result.g.dart';

@JsonSerializable()
class ScanResult {
  const ScanResult({
    required this.asset,
    required this.action,
    required this.targetName,
    required this.returnedFrom,
  });

  factory ScanResult.fromJson(Map<String, Object?> json) => _$ScanResultFromJson(json);

  final ScannedAsset asset;
  final ScanResultAction action;

  /// Name of the location or production, for the session log.
  final String targetName;

  /// Productions the asset was automatically returned from.
  final List<String> returnedFrom;

  Map<String, Object?> toJson() => _$ScanResultToJson(this);
}
