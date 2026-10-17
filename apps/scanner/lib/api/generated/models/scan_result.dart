// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'scan_group.dart';
import 'scan_kit.dart';
import 'scan_result_action.dart';
import 'scanned_asset.dart';

part 'scan_result.g.dart';

@JsonSerializable()
class ScanResult {
  const ScanResult({
    required this.asset,
    required this.action,
    required this.targetName,
    required this.returnedFrom,
    this.group,
    this.kit,
  });
  
  factory ScanResult.fromJson(Map<String, Object?> json) => _$ScanResultFromJson(json);
  
  final ScannedAsset asset;
  final ScanResultAction action;

  /// Name of the location or production, for the session log.
  final String targetName;

  /// Productions the asset was automatically returned from.
  final List<String> returnedFrom;

  /// Set when the scanned unit belongs with others — the rest of its kit,.
  /// or the unit it hangs off and that unit's other accessories. Only the.
  /// scanned unit was booked; offer these, and book the ones picked with.
  /// `createScanBatch`. Not required, so an older client keeps working.
  ///
  final ScanGroup? group;

  /// Set when the code was a kit's own sticker: every unit in it that the.
  /// caller may book went to the target at once, accessories along. `asset`.
  /// then stands for the kit — the id of its first unit, the kit's name.
  /// and tag — so an older client still reports something true. Ask about.
  /// `kit.units` and book back what is missing. Not required, so an older.
  /// client keeps working.
  ///
  final ScanKit? kit;

  Map<String, Object?> toJson() => _$ScanResultToJson(this);
}
