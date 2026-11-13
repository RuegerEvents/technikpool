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
    this.notInterchangeable,
    this.isContainer,
    this.requiresInspection,
    this.inspections,
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

  /// `true` keeps its units from being swapped for one another when.
  /// handing out or checking a case (see `ScanSwap`) — a calibrated lens.
  /// that belongs to exactly one camera. Identity like the name.
  ///
  final bool? notInterchangeable;

  /// `true` makes its units containers: a bundle's case inside a.
  /// bundle, a pack case outside one (see `CatalogProduct`). Identity.
  /// like the name.
  ///
  final bool? isContainer;

  /// The electrical type. Null follows the category again.
  final bool? requiresInspection;

  /// Inspection type id → the product's own answer, or null to follow.
  /// the category again. Types left out are left alone.
  ///
  final Map<String, bool?>? inspections;

  /// The cable's ends, length and wire, or the loom's ways — replaced.
  /// wholesale. Null says this is not a cable and clears all of it.
  ///
  final CableUpdate? cable;

  /// The device's built-in connectors in panel order, replacing the panel. `[]` clears it.
  final List<ProductPortInput>? ports;

  Map<String, Object?> toJson() => _$ProductUpdateRequestToJson(this);
}
