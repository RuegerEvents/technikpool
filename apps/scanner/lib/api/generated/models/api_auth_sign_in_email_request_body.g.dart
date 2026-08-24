// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'api_auth_sign_in_email_request_body.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ApiAuthSignInEmailRequestBody _$ApiAuthSignInEmailRequestBodyFromJson(
  Map<String, dynamic> json,
) => ApiAuthSignInEmailRequestBody(
  email: json['email'] as String,
  password: json['password'] as String,
);

Map<String, dynamic> _$ApiAuthSignInEmailRequestBodyToJson(
  ApiAuthSignInEmailRequestBody instance,
) => <String, dynamic>{'email': instance.email, 'password': instance.password};
