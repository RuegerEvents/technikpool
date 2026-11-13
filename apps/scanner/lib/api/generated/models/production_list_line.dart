// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'pack_case.dart';
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
    this.ownerOrgId,
    this.lengthCm,
    this.productImageUrl,
    this.packCase,
  });
  
  factory ProductionListLine.fromJson(Map<String, Object?> json) => _$ProductionListLineFromJson(json);
  
  /// The organization the unit belongs to. With `lengthCm`, what the.
  /// cable colour is read off (see `GET /api/v1/cable-colors`). Not.
  /// required, so an older client keeps compiling.
  ///
  final String? ownerOrgId;

  /// The product's length in whole centimetres; null when it has none.
  final int? lengthCm;

  /// Identifies the line for a count; opaque to clients.
  final String key;
  final String productName;
  final String? productCaption;
  final String? manufacturerName;

  /// The product's picture, absolute like Product.imageUrl — for a.
  /// thumbnail beside the row. Null for a product without one. Not.
  /// required, so an older client keeps compiling.
  ///
  final String? productImageUrl;
  final String? lentBy;
  final ProductionCheckGroup group;
  final List<String> assetIds;
  final int total;
  final int done;

  /// The lowest count the caller can set — what others ticked stays.
  final int floor;

  /// The pack case these units are in. A line splits when only some of.
  /// its units go into a case: those are a line of their own under it.
  /// Not required, so an older client keeps compiling.
  ///
  final PackCase? packCase;

  Map<String, Object?> toJson() => _$ProductionListLineToJson(this);
}
