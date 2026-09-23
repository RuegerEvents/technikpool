// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'stocktake_location.dart';

part 'stocktake_location_count.g.dart';

@JsonSerializable()
class StocktakeLocationCount {
  const StocktakeLocationCount({
    required this.location,
    required this.expected,
    required this.counted,
    required this.myCount,
  });
  
  factory StocktakeLocationCount.fromJson(Map<String, Object?> json) => _$StocktakeLocationCountFromJson(json);
  
  final StocktakeLocation location;
  final int expected;
  final int counted;

  /// The caller's own count here, if they entered one.
  final int? myCount;

  Map<String, Object?> toJson() => _$StocktakeLocationCountToJson(this);
}
