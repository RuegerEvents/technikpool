// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'scan_swap.g.dart';

/// Units stay linked — an accessory on its unit, a unit in its kit — but.
/// whoever packs takes the one at hand. When a unit of the same product.
/// and organization as a linked one is handed out (or found in that one's.
/// case), the scanned unit takes its place, and the other takes the.
/// scanned one's old place, or becomes loose if it had none. Never on.
/// take-back or in a stocktake, and never for a product marked.
/// `notInterchangeable`. Both units' histories say so (`SWAPPED`).
///
@JsonSerializable()
class ScanSwap {
  const ScanSwap({
    required this.partnerAssetId,
    required this.partnerLabel,
    required this.joined,
    required this.partnerTo,
  });
  
  factory ScanSwap.fromJson(Map<String, Object?> json) => _$ScanSwapFromJson(json);
  
  /// The unit whose place the scanned one took.
  final String partnerAssetId;

  /// Its tag, else its number ("#12").
  final String partnerLabel;

  /// The kit, or the unit, the scanned unit is in now, by name.
  final String joined;

  /// Where the other unit went, by name. Null when it is now loose.
  final String? partnerTo;

  Map<String, Object?> toJson() => _$ScanSwapToJson(this);
}
