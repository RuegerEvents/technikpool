// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'cable_spec.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CableSpec _$CableSpecFromJson(Map<String, dynamic> json) => CableSpec(
  type: json['type'] as String?,
  connectorA: json['connectorA'] as String?,
  connectorB: json['connectorB'] as String?,
  lengthCm: (json['lengthCm'] as num?)?.toInt(),
);

Map<String, dynamic> _$CableSpecToJson(CableSpec instance) => <String, dynamic>{
  'type': ?instance.type,
  'connectorA': ?instance.connectorA,
  'connectorB': ?instance.connectorB,
  'lengthCm': ?instance.lengthCm,
};
