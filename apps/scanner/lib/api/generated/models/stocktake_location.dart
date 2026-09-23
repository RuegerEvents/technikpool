// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'stocktake_location.g.dart';

@JsonSerializable()
class StocktakeLocation {
  const StocktakeLocation({
    required this.id,
    required this.name,
  });
  
  factory StocktakeLocation.fromJson(Map<String, Object?> json) => _$StocktakeLocationFromJson(json);
  
  final String id;
  final String name;

  Map<String, Object?> toJson() => _$StocktakeLocationToJson(this);
}
