// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'list_kit.dart';
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
    this.productImageUrl,
    this.kit,
    this.kitAddition,
  });
  
  factory ProductionHandoutItem.fromJson(Map<String, Object?> json) => _$ProductionHandoutItemFromJson(json);
  
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

  /// RETURNED on the `checkout` list: taken back while the production.
  /// still runs — not owed, but a tick sends it out again.
  ///
  final ProductionHandoutItemStatus status;

  /// Out (`checkout`) or back (`checkin`).
  final bool done;
  final bool received;
  final bool returnReported;

  Map<String, Object?> toJson() => _$ProductionHandoutItemToJson(this);
}
