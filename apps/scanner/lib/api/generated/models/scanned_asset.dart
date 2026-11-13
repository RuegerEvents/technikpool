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
    this.ownerOrgId,
    this.lengthCm,
    this.productCaption,
  });
  
  factory ScannedAsset.fromJson(Map<String, Object?> json) => _$ScannedAssetFromJson(json);
  
  /// The organization the unit belongs to. With `lengthCm`, what the.
  /// cable colour is read off (see `GET /api/v1/cable-colors`). Not.
  /// required, so an older client keeps compiling.
  ///
  final String? ownerOrgId;

  /// The product's length in whole centimetres; null when it has none.
  final int? lengthCm;
  final String id;
  final String assetTag;
  final String productName;

  /// Null when the product has no maker; see Product.manufacturerName.
  final String? manufacturerName;

  /// The product's caption (see Product.caption), to be shown after the.
  /// product name. Not required, so an older client keeps compiling.
  ///
  final String? productCaption;

  Map<String, Object?> toJson() => _$ScannedAssetToJson(this);
}
