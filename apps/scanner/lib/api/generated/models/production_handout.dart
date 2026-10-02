// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'handout_mode.dart';
import 'production_check_side.dart';
import 'production_handout_item.dart';
import 'production_list_line.dart';

part 'production_handout.g.dart';

@JsonSerializable()
class ProductionHandout {
  const ProductionHandout({
    required this.mode,
    required this.productionId,
    required this.productionName,
    required this.cancelled,
    required this.side,
    required this.sides,
    required this.items,
    required this.lines,
    required this.othersCount,
  });
  
  factory ProductionHandout.fromJson(Map<String, Object?> json) => _$ProductionHandoutFromJson(json);
  
  final HandoutMode mode;
  final String productionId;
  final String productionName;

  /// Nothing more goes out to a cancelled production; taking back still works.
  final bool cancelled;
  final ProductionCheckSide side;

  /// Every side the caller could see the list from; more than one offers a choice.
  final List<ProductionCheckSide> sides;

  /// By section, each unit followed by its accessories.
  final List<ProductionHandoutItem> items;

  /// As in `ProductionCheck.lines`.
  final List<ProductionListLine> lines;

  /// Units in this step that other orgs book themselves.
  final int othersCount;

  Map<String, Object?> toJson() => _$ProductionHandoutToJson(this);
}
