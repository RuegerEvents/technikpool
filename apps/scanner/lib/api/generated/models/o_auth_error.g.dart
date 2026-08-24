// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'o_auth_error.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

OAuthError _$OAuthErrorFromJson(Map<String, dynamic> json) => OAuthError(
  error: OAuthErrorError.fromJson(json['error'] as String),
  errorDescription: json['error_description'] as String?,
);

Map<String, dynamic> _$OAuthErrorToJson(OAuthError instance) => <String, dynamic>{
  'error': instance.error,
  'error_description': ?instance.errorDescription,
};
