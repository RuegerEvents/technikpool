// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'stocktake_overlap.g.dart';

@JsonSerializable()
class StocktakeOverlap {
  const StocktakeOverlap({
    required this.id,
    required this.name,
    required this.sharedUnits,
  });
  
  factory StocktakeOverlap.fromJson(Map<String, Object?> json) => _$StocktakeOverlapFromJson(json);
  
  final String id;
  final String name;
  final int sharedUnits;

  Map<String, Object?> toJson() => _$StocktakeOverlapToJson(this);
}
