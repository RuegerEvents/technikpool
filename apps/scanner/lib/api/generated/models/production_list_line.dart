// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'production_check_group.dart';

part 'production_list_line.g.dart';

@JsonSerializable()
class ProductionListLine {
  const ProductionListLine({
    required this.key,
    required this.productName,
    required this.productCaption,
    required this.manufacturerName,
    required this.lentBy,
    required this.group,
    required this.assetIds,
    required this.total,
    required this.done,
    required this.floor,
  });
  
  factory ProductionListLine.fromJson(Map<String, Object?> json) => _$ProductionListLineFromJson(json);
  
  /// Identifies the line for a count; opaque to clients.
  final String key;
  final String productName;
  final String? productCaption;
  final String? manufacturerName;
  final String? lentBy;
  final ProductionCheckGroup group;
  final List<String> assetIds;
  final int total;
  final int done;

  /// The lowest count the caller can set — what others ticked stays.
  final int floor;

  Map<String, Object?> toJson() => _$ProductionListLineToJson(this);
}
