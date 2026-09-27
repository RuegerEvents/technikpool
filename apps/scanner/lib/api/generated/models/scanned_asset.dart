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
    this.productCaption,
  });
  
  factory ScannedAsset.fromJson(Map<String, Object?> json) => _$ScannedAssetFromJson(json);
  
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
