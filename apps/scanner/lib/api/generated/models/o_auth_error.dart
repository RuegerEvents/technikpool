// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'o_auth_error_error.dart';

part 'o_auth_error.g.dart';

@JsonSerializable()
class OAuthError {
  const OAuthError({
    required this.error,
    this.errorDescription,
  });
  
  factory OAuthError.fromJson(Map<String, Object?> json) => _$OAuthErrorFromJson(json);
  
  final OAuthErrorError error;
  @JsonKey(name: 'error_description')
  final String? errorDescription;

  Map<String, Object?> toJson() => _$OAuthErrorToJson(this);
}
