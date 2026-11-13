// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'pack_request.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PackRequest _$PackRequestFromJson(Map<String, dynamic> json) => PackRequest(
  caseAssetId: json['caseAssetId'] as String?,
  assetIds: (json['assetIds'] as List<dynamic>?)
      ?.map((e) => e as String)
      .toList(),
  line: json['line'] == null
      ? null
      : ProductionListLineCount.fromJson(json['line'] as Map<String, dynamic>),
  organizationId: json['organizationId'] as String?,
);

Map<String, dynamic> _$PackRequestToJson(PackRequest instance) =>
    <String, dynamic>{
      'caseAssetId': ?instance.caseAssetId,
      'assetIds': ?instance.assetIds,
      'line': ?instance.line,
      'organizationId': ?instance.organizationId,
    };
