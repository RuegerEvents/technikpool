// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'scanned_asset.g.dart';

@JsonSerializable()
class ScannedAsset {
  const ScannedAsset({
    required this.id,
    required this.assetTag,
    required this.productName,
    required this.manufacturerName,
  });

  factory ScannedAsset.fromJson(Map<String, Object?> json) =>
      _$ScannedAssetFromJson(json);

  final String id;
  final String assetTag;
  final String productName;
  final String manufacturerName;

  Map<String, Object?> toJson() => _$ScannedAssetToJson(this);
}
