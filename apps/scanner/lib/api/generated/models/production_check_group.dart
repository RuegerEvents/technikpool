// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'production_check_group_kind.dart';

part 'production_check_group.g.dart';

/// The section a unit is listed under. Items arrive sorted by it, so a.
/// client starts a new heading whenever it changes. `location`: the shelf.
/// it is kept on. `lender`: lent units, one section per lending org.
/// (`name` is the org). `none`: no location, `name` is null. An accessory.
/// is always in its parent's section.
///
@JsonSerializable()
class ProductionCheckGroup {
  const ProductionCheckGroup({
    required this.kind,
    required this.name,
  });
  
  factory ProductionCheckGroup.fromJson(Map<String, Object?> json) => _$ProductionCheckGroupFromJson(json);
  
  final ProductionCheckGroupKind kind;
  final String? name;

  Map<String, Object?> toJson() => _$ProductionCheckGroupToJson(this);
}
