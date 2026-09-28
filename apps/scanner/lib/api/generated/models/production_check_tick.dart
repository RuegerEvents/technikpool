// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'production_check_tick_via.dart';

part 'production_check_tick.g.dart';

@JsonSerializable()
class ProductionCheckTick {
  const ProductionCheckTick({
    required this.userName,
    required this.mine,
    required this.via,
    required this.at,
  });
  
  factory ProductionCheckTick.fromJson(Map<String, Object?> json) => _$ProductionCheckTickFromJson(json);
  
  final String userName;

  /// Ticked by the caller, who alone may untick it.
  final bool mine;
  final ProductionCheckTickVia via;
  final DateTime at;

  Map<String, Object?> toJson() => _$ProductionCheckTickToJson(this);
}
