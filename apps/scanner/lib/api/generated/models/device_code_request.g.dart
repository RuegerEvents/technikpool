// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'device_code_request.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DeviceCodeRequest _$DeviceCodeRequestFromJson(Map<String, dynamic> json) =>
    DeviceCodeRequest(
      clientId: json['client_id'] as String,
      scope: json['scope'] as String?,
    );

Map<String, dynamic> _$DeviceCodeRequestToJson(DeviceCodeRequest instance) =>
    <String, dynamic>{'client_id': instance.clientId, 'scope': ?instance.scope};
