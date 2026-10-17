// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'production_check_scan_result_result.dart';
import 'scan_group.dart';
import 'scan_kit.dart';

part 'production_check_scan_result.g.dart';

@JsonSerializable()
class ProductionCheckScanResult {
  const ProductionCheckScanResult({
    required this.result,
    required this.assetTag,
    required this.productName,
    required this.ticked,
    this.group,
    this.kit,
  });
  
  factory ProductionCheckScanResult.fromJson(Map<String, Object?> json) => _$ProductionCheckScanResultFromJson(json);
  
  final ProductionCheckScanResultResult result;
  final String assetTag;
  final String productName;

  /// Units this scan ticked — the unit and its untagged accessories.
  final int ticked;

  /// The rest of the scanned unit's kit on this list (kind `bundle`), to.
  /// offer ticking along; `done` is whether it is ticked already. Not.
  /// required, so an older client keeps working.
  ///
  final ScanGroup? group;

  /// Set when the code was a kit's sticker: its units on this list were.
  /// ticked, accessories along, and `productName`/`assetTag` are the kit's.
  /// `units` are the ones this scan ticked, to ask about. `unexpected`.
  /// with no units: none of the kit is on this list. Not required, so an.
  /// older client keeps working.
  ///
  final ScanKit? kit;

  Map<String, Object?> toJson() => _$ProductionCheckScanResultToJson(this);
}
