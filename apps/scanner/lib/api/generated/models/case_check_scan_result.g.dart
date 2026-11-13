// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'case_check_scan_result.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CaseCheckScanResult _$CaseCheckScanResultFromJson(Map<String, dynamic> json) =>
    CaseCheckScanResult(
      outcome: CaseCheckScanResultOutcome.fromJson(json['outcome'] as String),
      assetId: json['assetId'] as String?,
      name: json['name'] as String?,
      swap: json['swap'] == null
          ? null
          : ScanSwap.fromJson(json['swap'] as Map<String, dynamic>),
      check: json['check'] == null
          ? null
          : CaseCheck.fromJson(json['check'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$CaseCheckScanResultToJson(
  CaseCheckScanResult instance,
) => <String, dynamic>{
  'outcome': instance.outcome,
  'assetId': ?instance.assetId,
  'name': ?instance.name,
  'swap': ?instance.swap,
  'check': ?instance.check,
};
