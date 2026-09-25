// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'scan_group_kind.dart';
import 'scan_group_unit.dart';

part 'scan_group.g.dart';

@JsonSerializable()
class ScanGroup {
  const ScanGroup({
    required this.kind,
    required this.name,
    required this.units,
  });
  
  factory ScanGroup.fromJson(Map<String, Object?> json) => _$ScanGroupFromJson(json);
  
  /// `bundle`: the scanned unit is in a kit, and `units` is the rest of it.
  /// `parent`: the scanned unit is an accessory, and `units` is the unit it.
  /// hangs off (first) and that unit's other accessories.
  ///
  final ScanGroupKind kind;

  /// The kit's or the parent unit's name, with its tag where it has one.
  final String name;
  final List<ScanGroupUnit> units;

  Map<String, Object?> toJson() => _$ScanGroupToJson(this);
}
