// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'case_check_item.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CaseCheckItem _$CaseCheckItemFromJson(Map<String, dynamic> json) =>
    CaseCheckItem(
      assetId: json['assetId'] as String,
      assetTag: json['assetTag'] as String?,
      serialNumber: json['serialNumber'] as String?,
      orgIndex: (json['orgIndex'] as num).toInt(),
      name: json['name'] as String,
      caption: json['caption'] as String?,
      accessoryOf: json['accessoryOf'] as String?,
      awayOn: json['awayOn'] as String?,
    );

Map<String, dynamic> _$CaseCheckItemToJson(CaseCheckItem instance) =>
    <String, dynamic>{
      'assetId': instance.assetId,
      'assetTag': ?instance.assetTag,
      'serialNumber': ?instance.serialNumber,
      'orgIndex': instance.orgIndex,
      'name': instance.name,
      'caption': ?instance.caption,
      'accessoryOf': ?instance.accessoryOf,
      'awayOn': ?instance.awayOn,
    };
