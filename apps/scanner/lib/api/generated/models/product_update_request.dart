// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'cable_update.dart';
import 'product_port_input.dart';

part 'product_update_request.g.dart';

@JsonSerializable()
class ProductUpdateRequest {
  const ProductUpdateRequest({
    this.name,
    this.caption,
    this.details,
    this.manufacturerId,
    this.categoryId,
    this.isLicense,
    this.requiresInspection,
    this.cable,
    this.ports,
  });
  
  factory ProductUpdateRequest.fromJson(Map<String, Object?> json) => _$ProductUpdateRequestFromJson(json);
  
  final String? name;

  /// `""` clears it.
  final String? caption;

  /// `""` clears it.
  final String? details;

  /// From listManufacturers or createManufacturer. Null says nobody in particular makes it.
  final String? manufacturerId;
  final String? categoryId;

  /// A cable is never a licence; `true` on a cable is ignored.
  final bool? isLicense;

  /// Null follows the category again.
  final bool? requiresInspection;

  /// The cable's ends, length and wire, or the loom's ways — replaced.
  /// wholesale. Null says this is not a cable and clears all of it.
  ///
  final CableUpdate? cable;

  /// The device's built-in connectors in panel order, replacing the panel. `[]` clears it.
  final List<ProductPortInput>? ports;

  Map<String, Object?> toJson() => _$ProductUpdateRequestToJson(this);
}
