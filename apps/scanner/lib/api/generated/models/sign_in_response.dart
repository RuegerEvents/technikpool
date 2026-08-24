// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'user.dart';

part 'sign_in_response.g.dart';

@JsonSerializable()
class SignInResponse {
  const SignInResponse({
    this.user,
    this.redirect,
  });
  
  factory SignInResponse.fromJson(Map<String, Object?> json) => _$SignInResponseFromJson(json);
  
  final User? user;
  final bool? redirect;

  Map<String, Object?> toJson() => _$SignInResponseToJson(this);
}
