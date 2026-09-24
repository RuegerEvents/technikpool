// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'category.dart';
import 'stocktake_item_state.dart';
import 'stocktake_location.dart';

part 'stocktake_item.g.dart';

@JsonSerializable()
class StocktakeItem {
  const StocktakeItem({
    required this.assetId,
    required this.assetTag,
    required this.productName,
    required this.manufacturerName,
    required this.category,
    required this.parentAssetId,
    required this.state,
    required this.expectedLocation,
    required this.foundLocation,
    required this.foundByName,
    required this.foundByMe,
    required this.needsAttention,
    this.serialNumber,
    this.bundleName,
    this.outAt,
    this.unexpectedReason,
    this.note,
  });
  
  factory StocktakeItem.fromJson(Map<String, Object?> json) => _$StocktakeItemFromJson(json);
  
  final String assetId;
  final String? assetTag;
  final String? serialNumber;
  final String productName;
  final String? manufacturerName;
  final Category category;

  /// Set on an accessory; it is confirmed when its parent is scanned.
  final String? parentAssetId;

  /// The bundle it belongs to, with its tag where it has one.
  final String? bundleName;

  /// `open` is not counted yet; it turns into `missing` when the.
  /// stocktake closes. `out` is checked out on a production (right now.
  /// while open, at closing time once closed) and is accounted for.
  /// `unexpected` was scanned although it is not on the list — see.
  /// `unexpectedReason`.
  ///
  final StocktakeItemState state;
  final StocktakeLocation? expectedLocation;
  final StocktakeLocation? foundLocation;

  /// The production it is checked out to.
  final String? outAt;

  /// One of `other_org`, `retired`, `other_location`, `out_of_scope`.
  final String? unexpectedReason;
  final String? foundByName;

  /// Only these can be unticked or annotated by the caller.
  final bool foundByMe;
  final String? note;
  final bool needsAttention;

  Map<String, Object?> toJson() => _$StocktakeItemToJson(this);
}
