// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'catalog_product.dart';

part 'catalog_product_page.g.dart';

@JsonSerializable()
class CatalogProductPage {
  const CatalogProductPage({
    required this.items,
    required this.nextCursor,
  });
  
  factory CatalogProductPage.fromJson(Map<String, Object?> json) => _$CatalogProductPageFromJson(json);
  
  final List<CatalogProduct> items;

  /// Pass as `cursor` for the next page. Null on the last page.
  final String? nextCursor;

  Map<String, Object?> toJson() => _$CatalogProductPageToJson(this);
}
