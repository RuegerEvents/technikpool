// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'scan_request.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ScanRequest _$ScanRequestFromJson(Map<String, dynamic> json) => ScanRequest(
  assetTag: json['assetTag'] as String,
  targetType: ScanRequestTargetType.fromJson(json['targetType'] as String),
  targetId: json['targetId'] as String,
);

Map<String, dynamic> _$ScanRequestToJson(ScanRequest instance) => <String, dynamic>{
  'assetTag': instance.assetTag,
  'targetType': instance.targetType,
  'targetId': instance.targetId,
};
