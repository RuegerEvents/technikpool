// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

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
  });
  
  factory ProductionHandoutItem.fromJson(Map<String, Object?> json) => _$ProductionHandoutItemFromJson(json);
  
  final String assetId;
  final String? assetTag;
  final String productName;
  final String? productCaption;
  final String? manufacturerName;
  final String? lentBy;
  final String? accessoryOf;
  final ProductionCheckGroup group;
  final ProductionHandoutItemStatus status;

  /// Out (`checkout`) or back (`checkin`).
  final bool done;
  final bool received;
  final bool returnReported;

  Map<String, Object?> toJson() => _$ProductionHandoutItemToJson(this);
}
