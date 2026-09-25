// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'scan_batch_request.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ScanBatchRequest _$ScanBatchRequestFromJson(Map<String, dynamic> json) =>
    ScanBatchRequest(
      assetIds: (json['assetIds'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      targetType: ScanBatchRequestTargetType.fromJson(
        json['targetType'] as String,
      ),
      targetId: json['targetId'] as String,
    );

Map<String, dynamic> _$ScanBatchRequestToJson(ScanBatchRequest instance) =>
    <String, dynamic>{
      'assetIds': instance.assetIds,
      'targetType': instance.targetType,
      'targetId': instance.targetId,
    };
