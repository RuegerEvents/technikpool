// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'case_check.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CaseCheck _$CaseCheckFromJson(Map<String, dynamic> json) => CaseCheck(
  kind: CaseKind.fromJson(json['kind'] as String),
  id: json['id'] as String,
  tag: json['tag'] as String?,
  name: json['name'] as String,
  checkedOutTo: json['checkedOutTo'] as String?,
  items: (json['items'] as List<dynamic>)
      .map((e) => CaseCheckItem.fromJson(e as Map<String, dynamic>))
      .toList(),
  shortOfType: (json['shortOfType'] as List<dynamic>)
      .map((e) => ShortOfType.fromJson(e as Map<String, dynamic>))
      .toList(),
  lastCheck: json['lastCheck'] == null
      ? null
      : CaseCheckLast.fromJson(json['lastCheck'] as Map<String, dynamic>),
  canRecord: json['canRecord'] as bool,
  scannedAssetId: json['scannedAssetId'] as String?,
);

Map<String, dynamic> _$CaseCheckToJson(CaseCheck instance) => <String, dynamic>{
  'kind': instance.kind,
  'id': instance.id,
  'tag': ?instance.tag,
  'name': instance.name,
  'checkedOutTo': ?instance.checkedOutTo,
  'items': instance.items,
  'shortOfType': instance.shortOfType,
  'lastCheck': ?instance.lastCheck,
  'canRecord': instance.canRecord,
  'scannedAssetId': ?instance.scannedAssetId,
};
