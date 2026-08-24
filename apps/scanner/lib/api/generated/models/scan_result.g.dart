// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'scan_result.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ScanResult _$ScanResultFromJson(Map<String, dynamic> json) => ScanResult(
  asset: ScannedAsset.fromJson(json['asset'] as Map<String, dynamic>),
  action: ScanResultAction.fromJson(json['action'] as String),
  targetName: json['targetName'] as String,
  returnedFrom: (json['returnedFrom'] as List<dynamic>).map((e) => e as String).toList(),
);

Map<String, dynamic> _$ScanResultToJson(ScanResult instance) => <String, dynamic>{
  'asset': instance.asset,
  'action': instance.action,
  'targetName': instance.targetName,
  'returnedFrom': instance.returnedFrom,
};
