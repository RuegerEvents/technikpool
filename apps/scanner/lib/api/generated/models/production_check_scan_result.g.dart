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
);

Map<String, dynamic> _$ProductionCheckScanResultToJson(
  ProductionCheckScanResult instance,
) => <String, dynamic>{
  'result': instance.result,
  'assetTag': instance.assetTag,
  'productName': instance.productName,
  'ticked': instance.ticked,
};
