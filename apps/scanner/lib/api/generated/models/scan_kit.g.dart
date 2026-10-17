// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'scan_kit.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ScanKit _$ScanKitFromJson(Map<String, dynamic> json) => ScanKit(
  id: json['id'] as String,
  name: json['name'] as String,
  tag: json['tag'] as String?,
  units: (json['units'] as List<dynamic>)
      .map((e) => ScanGroupUnit.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$ScanKitToJson(ScanKit instance) => <String, dynamic>{
  'id': instance.id,
  'name': instance.name,
  'tag': ?instance.tag,
  'units': instance.units,
};
