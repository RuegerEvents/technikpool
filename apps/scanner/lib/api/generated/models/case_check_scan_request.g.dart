// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'case_check_scan_request.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CaseCheckScanRequest _$CaseCheckScanRequestFromJson(
  Map<String, dynamic> json,
) => CaseCheckScanRequest(
  code: json['code'] as String,
  foundAssetIds: (json['foundAssetIds'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
);

Map<String, dynamic> _$CaseCheckScanRequestToJson(
  CaseCheckScanRequest instance,
) => <String, dynamic>{
  'code': instance.code,
  'foundAssetIds': instance.foundAssetIds,
};
