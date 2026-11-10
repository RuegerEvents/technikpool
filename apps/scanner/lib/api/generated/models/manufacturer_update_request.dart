// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'manufacturer_update_request.g.dart';

@JsonSerializable()
class ManufacturerUpdateRequest {
  const ManufacturerUpdateRequest({
    required this.name,
  });
  
  factory ManufacturerUpdateRequest.fromJson(Map<String, Object?> json) => _$ManufacturerUpdateRequestFromJson(json);
  
  final String name;

  Map<String, Object?> toJson() => _$ManufacturerUpdateRequestToJson(this);
}
