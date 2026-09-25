// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'scan_group.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ScanGroup _$ScanGroupFromJson(Map<String, dynamic> json) => ScanGroup(
  kind: ScanGroupKind.fromJson(json['kind'] as String),
  name: json['name'] as String,
  units: (json['units'] as List<dynamic>)
      .map((e) => ScanGroupUnit.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$ScanGroupToJson(ScanGroup instance) => <String, dynamic>{
  'kind': instance.kind,
  'name': instance.name,
  'units': instance.units,
};
