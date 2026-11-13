// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'list_kit.dart';
import 'pack_case.dart';
import 'production_check_group.dart';
import 'production_handout_item_status.dart';

part 'production_handout_item.g.dart';

@JsonSerializable()
class ProductionHandoutItem {
  const ProductionHandoutItem({
    required this.assetId,
    required this.assetTag,
    required this.productName,
    required this.productCaption,
    required this.manufacturerName,
    required this.lentBy,
    required this.accessoryOf,
    required this.group,
    required this.status,
    required this.done,
    required this.received,
    required this.returnReported,
    this.ownerOrgId,
    this.lengthCm,
    this.productImageUrl,
    this.kit,
    this.kitAddition,
    this.packCase,
    this.isPackCase,
    this.inspectionOverdue,
  });
  
  factory ProductionHandoutItem.fromJson(Map<String, Object?> json) => _$ProductionHandoutItemFromJson(json);
  
  /// The organization the unit belongs to. With `lengthCm`, what the.
  /// cable colour is read off (see `GET /api/v1/cable-colors`). Not.
  /// required, so an older client keeps compiling.
  ///
  final String? ownerOrgId;

  /// The product's length in whole centimetres; null when it has none.
  final int? lengthCm;
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
  final String? lentBy;
  final String? accessoryOf;
  final ProductionCheckGroup group;

  /// Not required, so an older client keeps compiling.
  final ListKit? kit;

  /// Not booked yet: put into a kit after the kit was booked, and listed.
  /// with it. A tick books it and hands it out at once. Not required, so.
  /// an older client keeps compiling.
  ///
  final bool? kitAddition;

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

  /// RETURNED on the `checkout` list: taken back while the production.
  /// still runs — not owed, but a tick sends it out again.
  ///
  final ProductionHandoutItemStatus status;

  /// Out (`checkout`) or back (`checkin`).
  final bool done;
  final bool received;
  final bool returnReported;

  /// Some inspection of the unit is overdue. Handing it out still works;.
  /// say so. Not required, so an older client keeps compiling.
  ///
  final bool? inspectionOverdue;

  Map<String, Object?> toJson() => _$ProductionHandoutItemToJson(this);
}
