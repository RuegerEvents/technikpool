// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'cable_way.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CableWay _$CableWayFromJson(Map<String, dynamic> json) => CableWay(
  count: (json['count'] as num).toInt(),
  type: json['type'] as String?,
  connectorA: json['connectorA'] as String?,
  connectorB: json['connectorB'] as String?,
);

Map<String, dynamic> _$CableWayToJson(CableWay instance) => <String, dynamic>{
  'count': instance.count,
  'type': ?instance.type,
  'connectorA': ?instance.connectorA,
  'connectorB': ?instance.connectorB,
};
