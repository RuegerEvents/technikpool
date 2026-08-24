// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'device_code_request.g.dart';

@JsonSerializable()
class DeviceCodeRequest {
  const DeviceCodeRequest({
    required this.clientId,
    this.scope,
  });
  
  factory DeviceCodeRequest.fromJson(Map<String, Object?> json) => _$DeviceCodeRequestFromJson(json);
  
  @JsonKey(name: 'client_id')
  final String clientId;
  final String? scope;

  Map<String, Object?> toJson() => _$DeviceCodeRequestToJson(this);
}
