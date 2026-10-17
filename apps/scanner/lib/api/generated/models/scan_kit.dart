// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'scan_group_unit.dart';

part 'scan_kit.g.dart';

@JsonSerializable()
class ScanKit {
  const ScanKit({
    required this.id,
    required this.name,
    required this.tag,
    required this.units,
  });
  
  factory ScanKit.fromJson(Map<String, Object?> json) => _$ScanKitFromJson(json);
  
  final String id;

  /// The kit's name with its caption.
  final String name;
  final String? tag;

  /// The kit's units this scan booked (or ticked), by name. Empty when none.
  /// of them was on the list scanned into — the kit is not from here.
  ///
  final List<ScanGroupUnit> units;

  Map<String, Object?> toJson() => _$ScanKitToJson(this);
}
