// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'scan_kit_swap.g.dart';

/// A whole kit standing in for the booked one: ring 1 is booked, ring 2's.
/// number is scanned. The booking moves to ring 2 — the same bundle type.
/// and organization, wholly free — and both kits keep their contents.
/// Only while nothing of the booked kit has gone out; the lowest-numbered.
/// of several. Both kits' units' histories say so (`KIT_REPLACED`).
///
@JsonSerializable()
class ScanKitSwap {
  const ScanKitSwap({
    required this.replacedKitId,
    required this.replacedKitName,
    required this.kitId,
    required this.kitName,
  });
  
  factory ScanKitSwap.fromJson(Map<String, Object?> json) => _$ScanKitSwapFromJson(json);
  
  final String replacedKitId;

  /// The kit that stays home, with its number.
  final String replacedKitName;
  final String kitId;

  /// The kit that went out, with its number.
  final String kitName;

  Map<String, Object?> toJson() => _$ScanKitSwapToJson(this);
}
