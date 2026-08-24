// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'device_token_request.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DeviceTokenRequest _$DeviceTokenRequestFromJson(Map<String, dynamic> json) =>
    DeviceTokenRequest(
      grantType: json['grant_type'] as String,
      deviceCode: json['device_code'] as String,
      clientId: json['client_id'] as String,
    );

Map<String, dynamic> _$DeviceTokenRequestToJson(DeviceTokenRequest instance) =>
    <String, dynamic>{
      'grant_type': instance.grantType,
      'device_code': instance.deviceCode,
      'client_id': instance.clientId,
    };
