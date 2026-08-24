// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'api_auth_sign_in_email_request_body.g.dart';

@JsonSerializable()
class ApiAuthSignInEmailRequestBody {
  const ApiAuthSignInEmailRequestBody({required this.email, required this.password});

  factory ApiAuthSignInEmailRequestBody.fromJson(Map<String, Object?> json) =>
      _$ApiAuthSignInEmailRequestBodyFromJson(json);

  final String email;
  final String password;

  Map<String, Object?> toJson() => _$ApiAuthSignInEmailRequestBodyToJson(this);
}
