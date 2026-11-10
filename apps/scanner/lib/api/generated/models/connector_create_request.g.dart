// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'connector_create_request.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ConnectorCreateRequest _$ConnectorCreateRequestFromJson(
  Map<String, dynamic> json,
) => ConnectorCreateRequest(
  name: json['name'] as String,
  family: json['family'] as String?,
);

Map<String, dynamic> _$ConnectorCreateRequestToJson(
  ConnectorCreateRequest instance,
) => <String, dynamic>{'name': instance.name, 'family': ?instance.family};
