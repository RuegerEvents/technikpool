// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'manufacturer.dart';

part 'manufacturer_created.g.dart';

@JsonSerializable()
class ManufacturerCreated {
  const ManufacturerCreated({
    required this.manufacturer,
    required this.created,
  });
  
  factory ManufacturerCreated.fromJson(Map<String, Object?> json) => _$ManufacturerCreatedFromJson(json);
  
  final Manufacturer manufacturer;

  /// False when the catalog already had a manufacturer of that name.
  final bool created;

  Map<String, Object?> toJson() => _$ManufacturerCreatedToJson(this);
}
