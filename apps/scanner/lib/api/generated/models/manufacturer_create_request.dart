// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'manufacturer_create_request.g.dart';

@JsonSerializable()
class ManufacturerCreateRequest {
  const ManufacturerCreateRequest({
    required this.name,
  });
  
  factory ManufacturerCreateRequest.fromJson(Map<String, Object?> json) => _$ManufacturerCreateRequestFromJson(json);
  
  final String name;

  Map<String, Object?> toJson() => _$ManufacturerCreateRequestToJson(this);
}
