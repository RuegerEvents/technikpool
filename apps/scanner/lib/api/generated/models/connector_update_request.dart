// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'connector_update_request.g.dart';

@JsonSerializable()
class ConnectorUpdateRequest {
  const ConnectorUpdateRequest({
    required this.mains,
  });
  
  factory ConnectorUpdateRequest.fromJson(Map<String, Object?> json) => _$ConnectorUpdateRequestFromJson(json);
  
  final bool mains;

  Map<String, Object?> toJson() => _$ConnectorUpdateRequestToJson(this);
}
