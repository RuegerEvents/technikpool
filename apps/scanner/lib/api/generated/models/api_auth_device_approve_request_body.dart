// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'api_auth_device_approve_request_body.g.dart';

@JsonSerializable()
class ApiAuthDeviceApproveRequestBody {
  const ApiAuthDeviceApproveRequestBody({required this.userCode});

  factory ApiAuthDeviceApproveRequestBody.fromJson(Map<String, Object?> json) =>
      _$ApiAuthDeviceApproveRequestBodyFromJson(json);

  final String userCode;

  Map<String, Object?> toJson() => _$ApiAuthDeviceApproveRequestBodyToJson(this);
}
