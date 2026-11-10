// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'manufacturer_merge_request.g.dart';

@JsonSerializable()
class ManufacturerMergeRequest {
  const ManufacturerMergeRequest({
    required this.sourceManufacturerId,
  });
  
  factory ManufacturerMergeRequest.fromJson(Map<String, Object?> json) => _$ManufacturerMergeRequestFromJson(json);
  
  final String sourceManufacturerId;

  Map<String, Object?> toJson() => _$ManufacturerMergeRequestToJson(this);
}
