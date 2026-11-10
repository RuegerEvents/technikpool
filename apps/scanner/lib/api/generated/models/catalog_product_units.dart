// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'catalog_product_units.g.dart';

/// Active units of the caller's organizations.
@JsonSerializable()
class CatalogProductUnits {
  const CatalogProductUnits({
    required this.active,
    required this.tracked,
    required this.overdue,
  });
  
  factory CatalogProductUnits.fromJson(Map<String, Object?> json) => _$CatalogProductUnitsFromJson(json);
  
  final int active;

  /// Units that carry an inspection interval.
  final int tracked;

  /// Units whose inspection is due today or earlier.
  final int overdue;

  Map<String, Object?> toJson() => _$CatalogProductUnitsToJson(this);
}
