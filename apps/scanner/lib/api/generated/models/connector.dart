// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'connector.g.dart';

@JsonSerializable()
class Connector {
  const Connector({
    required this.productCount,
    required this.name,
    required this.family,
    required this.mains,
  });
  
  factory Connector.fromJson(Map<String, Object?> json) => _$ConnectorFromJson(json);
  
  /// Products naming it at a cable end, on a loom's way or on their panel.
  final int productCount;
  final String name;

  /// What it mates with — `Schuko M` and `Schuko F` are both `Schuko`.
  final String? family;

  /// Carries mains voltage. A product with one is electrical equipment.
  final bool mains;

  Map<String, Object?> toJson() => _$ConnectorToJson(this);
}
