// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

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
  });
  
  factory ProductionCheckItem.fromJson(Map<String, Object?> json) => _$ProductionCheckItemFromJson(json);
  
  final String assetId;
  final String? assetTag;
  final String productName;
  final String? productCaption;
  final String? manufacturerName;

  /// The org that lent the unit; null for the production's own.
  final String? lentBy;

  /// The unit it hangs off; listed right after it.
  final String? accessoryOf;
  final ProductionCheckGroup group;

  /// APPROVED is booked but not handed over yet.
  final ProductionCheckItemStatus status;

  /// Lent units only — the production confirmed having it.
  final bool received;

  /// Lent units only — the production reported it as sent back.
  final bool returnReported;
  final ProductionCheckTick? tick;

  Map<String, Object?> toJson() => _$ProductionCheckItemToJson(this);
}
