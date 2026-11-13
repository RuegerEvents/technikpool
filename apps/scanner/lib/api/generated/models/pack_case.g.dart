// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'pack_case.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PackCase _$PackCaseFromJson(Map<String, dynamic> json) => PackCase(
  assetId: json['assetId'] as String,
  name: json['name'] as String,
  tag: json['tag'] as String?,
  orgIndex: (json['orgIndex'] as num).toInt(),
  path: (json['path'] as List<dynamic>)
      .map((e) => PackCaseRef.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$PackCaseToJson(PackCase instance) => <String, dynamic>{
  'assetId': instance.assetId,
  'name': instance.name,
  'tag': ?instance.tag,
  'orgIndex': instance.orgIndex,
  'path': instance.path,
};
