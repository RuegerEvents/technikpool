// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'organization.dart';
import 'stocktake_item.dart';
import 'stocktake_location.dart';
import 'stocktake_product_count.dart';
import 'stocktake_progress.dart';
import 'stocktake_status.dart';

part 'stocktake_detail.g.dart';

@JsonSerializable()
class StocktakeDetail {
  const StocktakeDetail({
    required this.id,
    required this.name,
    required this.status,
    required this.organization,
    required this.createdAt,
    required this.createdByName,
    required this.progress,
    required this.countingLocations,
    required this.items,
    required this.products,
    this.closedAt,
  });
  
  factory StocktakeDetail.fromJson(Map<String, Object?> json) => _$StocktakeDetailFromJson(json);
  
  final String id;
  final String name;
  final StocktakeStatus status;
  final Organization organization;
  final DateTime createdAt;
  final String createdByName;
  final DateTime? closedAt;
  final StocktakeProgress progress;

  /// Where a counter can say they are counting: the scope's locations, or all of the organization's when the scope names none.
  final List<StocktakeLocation> countingLocations;
  final List<StocktakeItem> items;

  /// Loose untagged units, one entry per product.
  final List<StocktakeProductCount> products;

  Map<String, Object?> toJson() => _$StocktakeDetailToJson(this);
}
