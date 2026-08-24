// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'device_code_response.g.dart';

@JsonSerializable()
class DeviceCodeResponse {
  const DeviceCodeResponse({
    required this.deviceCode,
    required this.userCode,
    required this.verificationUri,
    required this.expiresIn,
    required this.interval,
    this.verificationUriComplete,
  });

  factory DeviceCodeResponse.fromJson(Map<String, Object?> json) =>
      _$DeviceCodeResponseFromJson(json);

  /// Secret. Sent when polling; never shown to the user.
  @JsonKey(name: 'device_code')
  final String deviceCode;

  /// Short code shown on the device for a human to type.
  @JsonKey(name: 'user_code')
  final String userCode;
  @JsonKey(name: 'verification_uri')
  final String verificationUri;

  /// verification_uri with the user code pre-filled.
  @JsonKey(name: 'verification_uri_complete')
  final String? verificationUriComplete;

  /// Seconds until the device code expires.
  @JsonKey(name: 'expires_in')
  final int expiresIn;

  /// Minimum seconds between polls.
  final int interval;

  Map<String, Object?> toJson() => _$DeviceCodeResponseToJson(this);
}
