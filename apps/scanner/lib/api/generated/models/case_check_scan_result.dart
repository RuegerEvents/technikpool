// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'case_check.dart';
import 'case_check_scan_result_outcome.dart';
import 'scan_swap.dart';

part 'case_check_scan_result.g.dart';

@JsonSerializable()
class CaseCheckScanResult {
  const CaseCheckScanResult({
    required this.outcome,
    required this.assetId,
    required this.name,
    required this.swap,
    required this.check,
  });
  
  factory CaseCheckScanResult.fromJson(Map<String, Object?> json) => _$CaseCheckScanResultFromJson(json);
  
  final CaseCheckScanResultOutcome outcome;

  /// `found` and `swapped`: the unit to tick.
  final String? assetId;

  /// `foreign`: what the code is, if known and visible to the caller.
  final String? name;

  /// `swapped`: what changed places.
  final ScanSwap? swap;

  /// `swapped`: the case as it is now, with the scanned unit in it.
  final CaseCheck? check;

  Map<String, Object?> toJson() => _$CaseCheckScanResultToJson(this);
}
