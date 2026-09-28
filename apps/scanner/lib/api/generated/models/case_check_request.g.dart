// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'case_check_request.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CaseCheckRequest _$CaseCheckRequestFromJson(Map<String, dynamic> json) =>
    CaseCheckRequest(
      kind: CaseKind.fromJson(json['kind'] as String),
      id: json['id'] as String,
      foundAssetIds: (json['foundAssetIds'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
    );

Map<String, dynamic> _$CaseCheckRequestToJson(CaseCheckRequest instance) =>
    <String, dynamic>{
      'kind': instance.kind,
      'id': instance.id,
      'foundAssetIds': instance.foundAssetIds,
    };
