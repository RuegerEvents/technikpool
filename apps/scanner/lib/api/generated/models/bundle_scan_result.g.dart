// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'bundle_scan_result.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BundleScanResult _$BundleScanResultFromJson(Map<String, dynamic> json) =>
    BundleScanResult(
      outcome: BundleScanOutcome.fromJson(json['outcome'] as String),
      bundle: BundleDetail.fromJson(json['bundle'] as Map<String, dynamic>),
      assetId: json['assetId'] as String?,
      scannedBundle: json['scannedBundle'] == null
          ? null
          : LocationRef.fromJson(json['scannedBundle'] as Map<String, dynamic>),
      otherBundle: json['otherBundle'] == null
          ? null
          : LocationRef.fromJson(json['otherBundle'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$BundleScanResultToJson(BundleScanResult instance) =>
    <String, dynamic>{
      'outcome': instance.outcome,
      'assetId': ?instance.assetId,
      'scannedBundle': ?instance.scannedBundle,
      'otherBundle': ?instance.otherBundle,
      'bundle': instance.bundle,
    };
