// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'catalog_product.dart';

part 'product_merged.g.dart';

@JsonSerializable()
class ProductMerged {
  const ProductMerged({
    required this.product,
    required this.movedUnits,
    required this.inheritedImage,
    required this.inheritedCable,
    required this.inheritedLicense,
  });
  
  factory ProductMerged.fromJson(Map<String, Object?> json) => _$ProductMergedFromJson(json);
  
  final CatalogProduct product;

  /// Units moved over, retired ones included.
  final int movedUnits;
  final bool inheritedImage;
  final bool inheritedCable;
  final bool inheritedLicense;

  Map<String, Object?> toJson() => _$ProductMergedToJson(this);
}
