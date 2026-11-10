// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'manufacturer.dart';

part 'manufacturer_merged.g.dart';

@JsonSerializable()
class ManufacturerMerged {
  const ManufacturerMerged({
    required this.manufacturer,
    required this.movedProducts,
  });
  
  factory ManufacturerMerged.fromJson(Map<String, Object?> json) => _$ManufacturerMergedFromJson(json);
  
  final Manufacturer manufacturer;
  final int movedProducts;

  Map<String, Object?> toJson() => _$ManufacturerMergedToJson(this);
}
