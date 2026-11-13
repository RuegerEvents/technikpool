// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'scan_swap.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ScanSwap _$ScanSwapFromJson(Map<String, dynamic> json) => ScanSwap(
  partnerAssetId: json['partnerAssetId'] as String,
  partnerLabel: json['partnerLabel'] as String,
  joined: json['joined'] as String,
  partnerTo: json['partnerTo'] as String?,
);

Map<String, dynamic> _$ScanSwapToJson(ScanSwap instance) => <String, dynamic>{
  'partnerAssetId': instance.partnerAssetId,
  'partnerLabel': instance.partnerLabel,
  'joined': instance.joined,
  'partnerTo': ?instance.partnerTo,
};
