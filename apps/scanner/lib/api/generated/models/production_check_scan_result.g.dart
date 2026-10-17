// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'production_check_scan_result.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ProductionCheckScanResult _$ProductionCheckScanResultFromJson(
  Map<String, dynamic> json,
) => ProductionCheckScanResult(
  result: ProductionCheckScanResultResult.fromJson(json['result'] as String),
  assetTag: json['assetTag'] as String,
  productName: json['productName'] as String,
  ticked: (json['ticked'] as num).toInt(),
  group: json['group'] == null
      ? null
      : ScanGroup.fromJson(json['group'] as Map<String, dynamic>),
  kit: json['kit'] == null
      ? null
      : ScanKit.fromJson(json['kit'] as Map<String, dynamic>),
);

Map<String, dynamic> _$ProductionCheckScanResultToJson(
  ProductionCheckScanResult instance,
) => <String, dynamic>{
  'result': instance.result,
  'assetTag': instance.assetTag,
  'productName': instance.productName,
  'ticked': instance.ticked,
  'group': ?instance.group,
  'kit': ?instance.kit,
};
