// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'production_check_item.dart';
import 'production_check_side.dart';
import 'production_check_status.dart';
import 'production_check_unexpected.dart';
import 'production_list_line.dart';

part 'production_check.g.dart';

@JsonSerializable()
class ProductionCheck {
  const ProductionCheck({
    required this.id,
    required this.status,
    required this.productionId,
    required this.productionName,
    required this.side,
    required this.createdAt,
    required this.createdBy,
    required this.closedAt,
    required this.closedBy,
    required this.items,
    required this.unexpected,
    required this.canConfirmReceipt,
    required this.canReportReturn,
    this.lines,
  });
  
  factory ProductionCheck.fromJson(Map<String, Object?> json) => _$ProductionCheckFromJson(json);
  
  final String id;
  final ProductionCheckStatus status;
  final String productionId;
  final String productionName;
  final ProductionCheckSide side;
  final DateTime createdAt;
  final String createdBy;
  final DateTime? closedAt;
  final String? closedBy;

  /// The list as it is now, by section, each unit followed by its accessories.
  final List<ProductionCheckItem> items;

  /// Interchangeable units without a tag, one counted line per product,.
  /// location and owner. Their units are in `items` as well; a client.
  /// that shows the lines leaves those out of the per-unit rows. Absent.
  /// from servers older than counted lines.
  ///
  final List<ProductionListLine>? lines;

  /// Ticked but not on the list.
  final List<ProductionCheckUnexpected> unexpected;

  /// How many units `receipt` would confirm for the caller — 0 hides it.
  final int canConfirmReceipt;

  /// How many units `return-report` would report for the caller — 0 hides it.
  final int canReportReturn;

  Map<String, Object?> toJson() => _$ProductionCheckToJson(this);
}
