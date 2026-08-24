// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'device_token_request.g.dart';

@JsonSerializable()
class DeviceTokenRequest {
  const DeviceTokenRequest({
    required this.grantType,
    required this.deviceCode,
    required this.clientId,
  });

  factory DeviceTokenRequest.fromJson(Map<String, Object?> json) =>
      _$DeviceTokenRequestFromJson(json);

  /// Always `urn:ietf:params:oauth:grant-type:device_code`.
  @JsonKey(name: 'grant_type')
  final String grantType;
  @JsonKey(name: 'device_code')
  final String deviceCode;
  @JsonKey(name: 'client_id')
  final String clientId;

  Map<String, Object?> toJson() => _$DeviceTokenRequestToJson(this);
}
