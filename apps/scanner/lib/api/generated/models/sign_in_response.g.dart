// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'sign_in_response.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SignInResponse _$SignInResponseFromJson(Map<String, dynamic> json) => SignInResponse(
  user: json['user'] == null ? null : User.fromJson(json['user'] as Map<String, dynamic>),
  redirect: json['redirect'] as bool?,
);

Map<String, dynamic> _$SignInResponseToJson(SignInResponse instance) => <String, dynamic>{
  'user': ?instance.user,
  'redirect': ?instance.redirect,
};
