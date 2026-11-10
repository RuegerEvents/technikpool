// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'cable_update.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CableUpdate _$CableUpdateFromJson(Map<String, dynamic> json) => CableUpdate(
  type: json['type'] as String?,
  connectorA: json['connectorA'] as String?,
  connectorB: json['connectorB'] as String?,
  lengthCm: (json['lengthCm'] as num?)?.toInt(),
  ways: (json['ways'] as List<dynamic>?)
      ?.map((e) => Ways.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$CableUpdateToJson(CableUpdate instance) =>
    <String, dynamic>{
      'type': ?instance.type,
      'connectorA': ?instance.connectorA,
      'connectorB': ?instance.connectorB,
      'lengthCm': ?instance.lengthCm,
      'ways': ?instance.ways,
    };
