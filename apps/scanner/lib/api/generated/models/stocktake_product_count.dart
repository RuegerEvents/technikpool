// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'category.dart';
import 'stocktake_location_count.dart';

part 'stocktake_product_count.g.dart';

@JsonSerializable()
class StocktakeProductCount {
  const StocktakeProductCount({
    required this.productId,
    required this.productName,
    required this.manufacturerName,
    required this.category,
    required this.expected,
    required this.out,
    required this.counted,
    required this.locations,
  });
  
  factory StocktakeProductCount.fromJson(Map<String, Object?> json) => _$StocktakeProductCountFromJson(json);
  
  final String productId;
  final String productName;
  final String? manufacturerName;
  final Category category;
  final int expected;
  final int out;

  /// Every counter's counts added up.
  final int counted;
  final List<StocktakeLocationCount> locations;

  Map<String, Object?> toJson() => _$StocktakeProductCountToJson(this);
}
