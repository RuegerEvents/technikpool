// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'stocktake_scan_result.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StocktakeScanResult _$StocktakeScanResultFromJson(Map<String, dynamic> json) =>
    StocktakeScanResult(
      outcome: StocktakeScanResultOutcome.fromJson(json['outcome'] as String),
      confirm: (json['confirm'] as List<dynamic>)
          .map((e) => StocktakeConfirmEntry.fromJson(e as Map<String, dynamic>))
          .toList(),
      item: json['item'] == null
          ? null
          : StocktakeItem.fromJson(json['item'] as Map<String, dynamic>),
      wasOutAt: json['wasOutAt'] as String?,
      alreadyFoundByName: json['alreadyFoundByName'] as String?,
      bundle: json['bundle'] == null
          ? null
          : StocktakeBundle.fromJson(json['bundle'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$StocktakeScanResultToJson(
  StocktakeScanResult instance,
) => <String, dynamic>{
  'outcome': instance.outcome,
  'item': ?instance.item,
  'wasOutAt': ?instance.wasOutAt,
  'alreadyFoundByName': ?instance.alreadyFoundByName,
  'bundle': ?instance.bundle,
  'confirm': instance.confirm,
};
