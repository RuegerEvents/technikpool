// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'stocktake_overlap.dart';

part 'stocktake_preview.g.dart';

@JsonSerializable()
class StocktakePreview {
  const StocktakePreview({
    required this.units,
    required this.looseUnits,
    required this.out,
    required this.overlaps,
  });
  
  factory StocktakePreview.fromJson(Map<String, Object?> json) => _$StocktakePreviewFromJson(json);
  
  /// Units to find one by one — tagged, accessories, bundle members.
  final int units;

  /// Untagged units, counted per product rather than ticked.
  final int looseUnits;

  /// Checked out on a production, so accounted for rather than expected.
  final int out;
  final List<StocktakeOverlap> overlaps;

  Map<String, Object?> toJson() => _$StocktakePreviewToJson(this);
}
