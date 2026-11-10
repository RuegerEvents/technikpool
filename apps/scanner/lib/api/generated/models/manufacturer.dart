// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'manufacturer.g.dart';

@JsonSerializable()
class Manufacturer {
  const Manufacturer({
    required this.id,
    required this.name,
    required this.productCount,
  });
  
  factory Manufacturer.fromJson(Map<String, Object?> json) => _$ManufacturerFromJson(json);
  
  final String id;
  final String name;
  final int productCount;

  Map<String, Object?> toJson() => _$ManufacturerToJson(this);
}
