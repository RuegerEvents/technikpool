// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'device_token_response.g.dart';

@JsonSerializable()
class DeviceTokenResponse {
  const DeviceTokenResponse({
    required this.accessToken,
    required this.tokenType,
    this.expiresIn,
    this.scope,
  });

  factory DeviceTokenResponse.fromJson(Map<String, Object?> json) =>
      _$DeviceTokenResponseFromJson(json);

  /// A better-auth session token. Use as the bearer credential.
  @JsonKey(name: 'access_token')
  final String accessToken;
  @JsonKey(name: 'token_type')
  final String tokenType;
  @JsonKey(name: 'expires_in')
  final int? expiresIn;
  final String? scope;

  Map<String, Object?> toJson() => _$DeviceTokenResponseToJson(this);
}
