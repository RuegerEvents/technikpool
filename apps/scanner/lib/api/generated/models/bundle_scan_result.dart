// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'bundle_detail.dart';
import 'bundle_scan_outcome.dart';
import 'location_ref.dart';

part 'bundle_scan_result.g.dart';

@JsonSerializable()
class BundleScanResult {
  const BundleScanResult({
    required this.outcome,
    required this.bundle,
    this.assetId,
    this.scannedBundle,
    this.otherBundle,
  });
  
  factory BundleScanResult.fromJson(Map<String, Object?> json) => _$BundleScanResultFromJson(json);
  
  final BundleScanOutcome outcome;

  /// The unit that went in (or already was). Null for a kit.
  final String? assetId;

  /// When the code was another kit's tag, that kit.
  final LocationRef? scannedBundle;

  /// With `in_other_bundle`, the kit the unit (or scanned kit) is in now.
  final LocationRef? otherBundle;
  final BundleDetail bundle;

  Map<String, Object?> toJson() => _$BundleScanResultToJson(this);
}
