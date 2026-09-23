// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'stocktake_tick_result.g.dart';

@JsonSerializable()
class StocktakeTickResult {
  const StocktakeTickResult({
    required this.ticked,
    required this.alreadyFound,
  });
  
  factory StocktakeTickResult.fromJson(Map<String, Object?> json) => _$StocktakeTickResultFromJson(json);
  
  final int ticked;
  final int alreadyFound;

  Map<String, Object?> toJson() => _$StocktakeTickResultToJson(this);
}
