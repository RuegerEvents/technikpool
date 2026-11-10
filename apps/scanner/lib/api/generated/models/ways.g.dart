// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'ways.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

Ways _$WaysFromJson(Map<String, dynamic> json) => Ways(
  count: (json['count'] as num).toInt(),
  type: json['type'] as String?,
  connectorA: json['connectorA'] as String?,
  connectorB: json['connectorB'] as String?,
);

Map<String, dynamic> _$WaysToJson(Ways instance) => <String, dynamic>{
  'count': instance.count,
  'type': ?instance.type,
  'connectorA': ?instance.connectorA,
  'connectorB': ?instance.connectorB,
};
