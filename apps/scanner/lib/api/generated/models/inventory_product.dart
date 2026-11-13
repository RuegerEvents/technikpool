// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'product.dart';

part 'inventory_product.g.dart';

@JsonSerializable()
class InventoryProduct {
  const InventoryProduct({
    required this.product,
    required this.organizationId,
    required this.organizationName,
    required this.count,
    required this.available,
    required this.untagged,
  });
  
  factory InventoryProduct.fromJson(Map<String, Object?> json) => _$InventoryProductFromJson(json);
  
  final Product product;
  final String organizationId;

  /// The org's short name, else its name.
  final String organizationName;

  /// Active units after the filters.
  final int count;

  /// Of those, how many are AVAILABLE.
  final int available;

  /// Of those, how many carry no tag.
  final int untagged;

  Map<String, Object?> toJson() => _$InventoryProductToJson(this);
}
