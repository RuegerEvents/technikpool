// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'connector.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

Connector _$ConnectorFromJson(Map<String, dynamic> json) => Connector(
  name: json['name'] as String,
  family: json['family'] as String?,
  mains: json['mains'] as bool,
);

Map<String, dynamic> _$ConnectorToJson(Connector instance) => <String, dynamic>{
  'name': instance.name,
  'family': ?instance.family,
  'mains': instance.mains,
};
