// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'pack_case_ref.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PackCaseRef _$PackCaseRefFromJson(Map<String, dynamic> json) => PackCaseRef(
  assetId: json['assetId'] as String,
  name: json['name'] as String,
  tag: json['tag'] as String?,
  orgIndex: (json['orgIndex'] as num).toInt(),
);

Map<String, dynamic> _$PackCaseRefToJson(PackCaseRef instance) =>
    <String, dynamic>{
      'assetId': instance.assetId,
      'name': instance.name,
      'tag': ?instance.tag,
      'orgIndex': instance.orgIndex,
    };
