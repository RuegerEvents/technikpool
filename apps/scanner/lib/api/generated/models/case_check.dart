// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'case_check_item.dart';
import 'case_check_last.dart';
import 'case_kind.dart';
import 'short_of_type.dart';

part 'case_check.g.dart';

@JsonSerializable()
class CaseCheck {
  const CaseCheck({
    required this.kind,
    required this.id,
    required this.tag,
    required this.name,
    required this.checkedOutTo,
    required this.items,
    required this.shortOfType,
    required this.lastCheck,
    required this.canRecord,
    required this.scannedAssetId,
  });
  
  factory CaseCheck.fromJson(Map<String, Object?> json) => _$CaseCheckFromJson(json);
  
  final CaseKind kind;

  /// The bundle's id, or the unit's.
  final String id;

  /// The bundle's own tag. Scanning it inside the check ticks nothing.
  final String? tag;
  final String name;

  /// The production the case as a whole is out on, if any.
  final String? checkedOutTo;

  /// What the case should hold, each unit followed by its accessories.
  final List<CaseCheckItem> items;

  /// Kits only: products other cases of the same kit type hold more of.
  /// A unit taken out of the kit for good is no longer on the list, so.
  /// this is the only place it shows.
  ///
  final List<ShortOfType> shortOfType;
  final CaseCheckLast? lastCheck;

  /// Whether the caller may record the check. Anyone who sees the units may run one.
  final bool canRecord;

  /// The unit the code was on, to count as found. Null for a bundle tag.
  final String? scannedAssetId;

  Map<String, Object?> toJson() => _$CaseCheckToJson(this);
}
