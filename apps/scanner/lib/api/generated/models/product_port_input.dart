// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'port_requirement.dart';

part 'product_port_input.g.dart';

@JsonSerializable()
class ProductPortInput {
  const ProductPortInput({
    required this.connector,
    required this.count,
    this.label,
    this.requirement,
  });
  
  factory ProductPortInput.fromJson(Map<String, Object?> json) => _$ProductPortInputFromJson(json);
  
  /// A connector name from listConnectors.
  final String connector;
  final int count;

  /// What the panel is printed with — `DMX In`, `Power Out`.
  final String? label;
  final PortRequirement? requirement;

  Map<String, Object?> toJson() => _$ProductPortInputToJson(this);
}
