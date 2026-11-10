// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'connector_create_request.g.dart';

@JsonSerializable()
class ConnectorCreateRequest {
  const ConnectorCreateRequest({
    required this.name,
    this.family,
  });
  
  factory ConnectorCreateRequest.fromJson(Map<String, Object?> json) => _$ConnectorCreateRequestFromJson(json);
  
  final String name;

  /// What it mates with. Defaults to the name's first word.
  final String? family;

  Map<String, Object?> toJson() => _$ConnectorCreateRequestToJson(this);
}
