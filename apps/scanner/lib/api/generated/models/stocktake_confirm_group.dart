// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'stocktake_confirm_group_kind.dart';

part 'stocktake_confirm_group.g.dart';

@JsonSerializable()
class StocktakeConfirmGroup {
  const StocktakeConfirmGroup({
    required this.kind,
    required this.name,
  });
  
  factory StocktakeConfirmGroup.fromJson(Map<String, Object?> json) => _$StocktakeConfirmGroupFromJson(json);
  
  final StocktakeConfirmGroupKind kind;

  /// The kit's or the parent unit's name, with its tag where it has one.
  final String name;

  Map<String, Object?> toJson() => _$StocktakeConfirmGroupToJson(this);
}
