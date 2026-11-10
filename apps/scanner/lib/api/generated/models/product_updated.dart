// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'catalog_product.dart';

part 'product_updated.g.dart';

@JsonSerializable()
class ProductUpdated {
  const ProductUpdated({
    required this.product,
    required this.unitsChanged,
  });
  
  factory ProductUpdated.fromJson(Map<String, Object?> json) => _$ProductUpdatedFromJson(json);
  
  final CatalogProduct product;

  /// Units whose inspection interval this change set or cleared.
  final int unitsChanged;

  Map<String, Object?> toJson() => _$ProductUpdatedToJson(this);
}
