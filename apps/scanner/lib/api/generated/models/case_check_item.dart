// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'kit_ref.dart';

part 'case_check_item.g.dart';

@JsonSerializable()
class CaseCheckItem {
  const CaseCheckItem({
    required this.assetId,
    required this.assetTag,
    required this.serialNumber,
    required this.orgIndex,
    required this.name,
    required this.caption,
    required this.accessoryOf,
    required this.awayOn,
    this.innerKit,
  });
  
  factory CaseCheckItem.fromJson(Map<String, Object?> json) => _$CaseCheckItemFromJson(json);
  
  final String assetId;
  final String? assetTag;
  final String? serialNumber;

  /// The unit's number within its org, shown as "#123".
  final int orgIndex;

  /// Maker and product name.
  final String name;
  final String? caption;

  /// The unit in this case it hangs off; listed right after it.
  final String? accessoryOf;

  /// The production this unit is checked out to when the rest of the.
  /// case is somewhere else — taken out for another job. Not finding it.
  /// counts as away, not missing.
  ///
  final String? awayOn;

  /// The kit inside the case that this unit is in (the adapter set in the.
  /// FOH case). Its units come after the case's own, one kit after.
  /// another, so a client starts a sub-heading whenever it changes.
  ///
  final KitRef? innerKit;

  Map<String, Object?> toJson() => _$CaseCheckItemToJson(this);
}
