// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'list_kit.dart';
import 'pack_case.dart';
import 'production_check_group.dart';
import 'production_check_item_status.dart';
import 'production_check_tick.dart';

part 'production_check_item.g.dart';

@JsonSerializable()
class ProductionCheckItem {
  const ProductionCheckItem({
    required this.assetId,
    required this.assetTag,
    required this.productName,
    required this.productCaption,
    required this.manufacturerName,
    required this.lentBy,
    required this.accessoryOf,
    required this.group,
    required this.status,
    required this.received,
    required this.returnReported,
    required this.tick,
    this.productImageUrl,
    this.kit,
    this.packCase,
    this.isPackCase,
  });
  
  factory ProductionCheckItem.fromJson(Map<String, Object?> json) => _$ProductionCheckItemFromJson(json);
  
  final String assetId;
  final String? assetTag;
  final String productName;
  final String? productCaption;
  final String? manufacturerName;

  /// The product's picture, absolute like Product.imageUrl — for a.
  /// thumbnail beside the row. Null for a product without one. Not.
  /// required, so an older client keeps compiling.
  ///
  final String? productImageUrl;

  /// The org that lent the unit; null for the production's own.
  final String? lentBy;

  /// The unit it hangs off; listed right after it.
  final String? accessoryOf;
  final ProductionCheckGroup group;

  /// Not required, so an older client keeps compiling.
  final ListKit? kit;

  /// The pack case the unit is listed under: the one it travels in, or.
  /// for a case itself (`isPackCase`), its own. A client lists a section.
  /// per case first — a case inside another right after it, `path`.
  /// saying how far in — the case's own row on top, and everything with.
  /// no case after them under "loose", in the sections it always had.
  /// Not required, so an older client keeps compiling.
  ///
  final PackCase? packCase;

  /// A pack case: its product is a container (`CatalogProduct.isContainer`).
  /// and it is in no bundle.
  /// Not required, so an older client keeps compiling.
  ///
  final bool? isPackCase;

  /// APPROVED is booked but not handed over yet.
  final ProductionCheckItemStatus status;

  /// Lent units only — the production confirmed having it.
  final bool received;

  /// Lent units only — the production reported it as sent back.
  final bool returnReported;
  final ProductionCheckTick? tick;

  Map<String, Object?> toJson() => _$ProductionCheckItemToJson(this);
}
