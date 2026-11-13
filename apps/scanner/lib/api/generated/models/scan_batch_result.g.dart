// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'scan_batch_result.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ScanBatchResult _$ScanBatchResultFromJson(Map<String, dynamic> json) =>
    ScanBatchResult(
      count: (json['count'] as num).toInt(),
      targetName: json['targetName'] as String,
      swaps: (json['swaps'] as List<dynamic>?)
          ?.map((e) => ScanSwap.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$ScanBatchResultToJson(ScanBatchResult instance) =>
    <String, dynamic>{
      'count': instance.count,
      'targetName': instance.targetName,
      'swaps': ?instance.swaps,
    };
