// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'asset.dart';

part 'asset_create_result.g.dart';

@JsonSerializable()
class AssetCreateResult {
  const AssetCreateResult({
    required this.assets,
  });
  
  factory AssetCreateResult.fromJson(Map<String, Object?> json) => _$AssetCreateResultFromJson(json);
  
  final List<Asset> assets;

  Map<String, Object?> toJson() => _$AssetCreateResultToJson(this);
}
