// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'device_token_response.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DeviceTokenResponse _$DeviceTokenResponseFromJson(Map<String, dynamic> json) =>
    DeviceTokenResponse(
      accessToken: json['access_token'] as String,
      tokenType: json['token_type'] as String,
      expiresIn: (json['expires_in'] as num?)?.toInt(),
      scope: json['scope'] as String?,
    );

Map<String, dynamic> _$DeviceTokenResponseToJson(DeviceTokenResponse instance) =>
    <String, dynamic>{
      'access_token': instance.accessToken,
      'token_type': instance.tokenType,
      'expires_in': ?instance.expiresIn,
      'scope': ?instance.scope,
    };
