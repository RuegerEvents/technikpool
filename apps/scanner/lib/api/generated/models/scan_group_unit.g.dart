// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'scan_group_unit.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ScanGroupUnit _$ScanGroupUnitFromJson(Map<String, dynamic> json) =>
    ScanGroupUnit(
      id: json['id'] as String,
      assetTag: json['assetTag'] as String?,
      productName: json['productName'] as String,
      manufacturerName: json['manufacturerName'] as String?,
      done: json['done'] as bool,
    );

Map<String, dynamic> _$ScanGroupUnitToJson(ScanGroupUnit instance) =>
    <String, dynamic>{
      'id': instance.id,
      'assetTag': ?instance.assetTag,
      'productName': instance.productName,
      'manufacturerName': ?instance.manufacturerName,
      'done': instance.done,
    };
