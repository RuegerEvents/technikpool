// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'port_requirement.dart';

part 'product_port.g.dart';

@JsonSerializable()
class ProductPort {
  const ProductPort({
    required this.connector,
    required this.count,
    required this.label,
    required this.requirement,
  });
  
  factory ProductPort.fromJson(Map<String, Object?> json) => _$ProductPortFromJson(json);
  
  final String connector;
  final int count;
  final String? label;
  final PortRequirement requirement;

  Map<String, Object?> toJson() => _$ProductPortToJson(this);
}
