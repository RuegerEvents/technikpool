// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'asset_tag_request.g.dart';

@JsonSerializable()
class AssetTagRequest {
  const AssetTagRequest({
    required this.assetTag,
  });
  
  factory AssetTagRequest.fromJson(Map<String, Object?> json) => _$AssetTagRequestFromJson(json);
  
  final String assetTag;

  Map<String, Object?> toJson() => _$AssetTagRequestToJson(this);
}
