// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'catalog_log_entry.g.dart';

@JsonSerializable()
class CatalogLogEntry {
  const CatalogLogEntry({
    required this.id,
    required this.action,
    required this.createdAt,
    required this.userName,
    required this.productId,
    required this.manufacturerId,
    required this.categoryId,
    required this.data,
    this.productName,
  });
  
  factory CatalogLogEntry.fromJson(Map<String, Object?> json) => _$CatalogLogEntryFromJson(json);
  
  final String id;

  /// `PRODUCT_UPDATED`, `PRODUCT_DELETED`, `PRODUCT_MERGED`,.
  /// `PRODUCT_PRICE_SET`, `PRODUCT_DOCUMENT_ADDED`,.
  /// `PRODUCT_DOCUMENT_REMOVED`, `MANUFACTURER_UPDATED`,.
  /// `MANUFACTURER_MERGED` or `CATEGORY_UPDATED`. Only a.
  /// `PRODUCT_UPDATED` entry can be reverted.
  ///
  final String action;
  final DateTime createdAt;

  /// Null once the account has been deleted.
  final String? userName;

  /// May name a product that no longer exists.
  final String? productId;

  /// The product's label now, while it still exists.
  final String? productName;
  final String? manufacturerId;
  final String? categoryId;

  /// What the entry recorded. For an update, `changes` lists.
  /// `{ field, from, to }` per field that moved, and `revertOf` names.
  /// the entry a revert undid.
  ///
  final dynamic data;

  Map<String, Object?> toJson() => _$CatalogLogEntryToJson(this);
}
