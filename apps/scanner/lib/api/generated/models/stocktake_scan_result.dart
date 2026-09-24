// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'stocktake_bundle.dart';
import 'stocktake_confirm_entry.dart';
import 'stocktake_item.dart';
import 'stocktake_scan_result_outcome.dart';

part 'stocktake_scan_result.g.dart';

@JsonSerializable()
class StocktakeScanResult {
  const StocktakeScanResult({
    required this.outcome,
    required this.confirm,
    this.item,
    this.wasOutAt,
    this.alreadyFoundByName,
    this.bundle,
  });
  
  factory StocktakeScanResult.fromJson(Map<String, Object?> json) => _$StocktakeScanResultFromJson(json);
  
  final StocktakeScanResultOutcome outcome;

  /// The scanned unit. Absent for a bundle.
  final StocktakeItem? item;

  /// It is checked out to this production, and is here after all.
  final String? wasOutAt;

  /// For `already`, who counted it.
  final String? alreadyFoundByName;
  final StocktakeBundle? bundle;

  /// Accessories of the scanned unit, or the bundle's members.
  final List<StocktakeConfirmEntry> confirm;

  Map<String, Object?> toJson() => _$StocktakeScanResultToJson(this);
}
