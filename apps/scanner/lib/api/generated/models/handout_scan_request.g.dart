// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'handout_scan_request.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

HandoutScanRequest _$HandoutScanRequestFromJson(Map<String, dynamic> json) =>
    HandoutScanRequest(
      code: json['code'] as String,
      packInto: json['packInto'] as String?,
    );

Map<String, dynamic> _$HandoutScanRequestToJson(HandoutScanRequest instance) =>
    <String, dynamic>{'code': instance.code, 'packInto': ?instance.packInto};
