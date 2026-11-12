// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'bundle_scan_request.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BundleScanRequest _$BundleScanRequestFromJson(Map<String, dynamic> json) =>
    BundleScanRequest(
      code: json['code'] as String,
      moveFromOtherBundle: json['moveFromOtherBundle'] as bool?,
    );

Map<String, dynamic> _$BundleScanRequestToJson(BundleScanRequest instance) =>
    <String, dynamic>{
      'code': instance.code,
      'moveFromOtherBundle': ?instance.moveFromOtherBundle,
    };
