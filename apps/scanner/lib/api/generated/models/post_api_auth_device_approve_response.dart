// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'post_api_auth_device_approve_response.g.dart';

@JsonSerializable()
class PostApiAuthDeviceApproveResponse {
  const PostApiAuthDeviceApproveResponse({this.success});

  factory PostApiAuthDeviceApproveResponse.fromJson(Map<String, Object?> json) =>
      _$PostApiAuthDeviceApproveResponseFromJson(json);

  final bool? success;

  Map<String, Object?> toJson() => _$PostApiAuthDeviceApproveResponseToJson(this);
}
