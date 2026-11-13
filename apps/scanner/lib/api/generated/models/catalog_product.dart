// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'cable_spec.dart';
import 'catalog_product_units.dart';
import 'category.dart';
import 'product_inspection_requirement.dart';
import 'product_port.dart';

part 'catalog_product.g.dart';

@JsonSerializable()
class CatalogProduct {
  const CatalogProduct({
    required this.id,
    required this.name,
    required this.manufacturerName,
    required this.category,
    required this.requiresInspection,
    required this.inspectionRequired,
    required this.isLicense,
    required this.mainsConnectors,
    required this.units,
    this.caption,
    this.details,
    this.imageUrl,
    this.cable,
    this.inspections,
    this.notInterchangeable,
    this.ports,
  });
  
  factory CatalogProduct.fromJson(Map<String, Object?> json) => _$CatalogProductFromJson(json);
  
  final String id;
  final String name;

  /// Null for a product nobody makes in particular — a Schuko lead, a.
  /// generic laptop. Show the product name alone then, not a placeholder.
  ///
  final String? manufacturerName;

  /// What the team calls this product ("16-port PoE switch"), to be.
  /// shown after its name. Not required, so an older client keeps.
  /// compiling.
  ///
  final String? caption;

  /// Free text about the product — handling notes and the like. For a.
  /// view of the product or one of its units, not for lists.
  ///
  final String? details;
  final Category category;
  final String? imageUrl;

  /// Present only for cables. The name already carries type and length;.
  /// this is the structured form, for filtering and for showing the ends.
  /// without parsing a label. Deliberately not required, like.
  /// Location.address: a client that predates it keeps compiling.
  ///
  final CableSpec? cable;

  /// The product's own answer for electrical inspections. Null follows its category.
  final bool? requiresInspection;

  /// Whether its units need electrical (DGUV V3) inspections:.
  /// `requiresInspection`, else the category's. A licence never does.
  ///
  final bool inspectionRequired;

  /// Per inspection type, whether its units need it and whether.
  /// that is the product's own answer. Every type is listed. Not.
  /// required, so an older client keeps compiling.
  ///
  final List<ProductInspectionRequirement>? inspections;
  final bool isLicense;

  /// Its units are never swapped for one another in a kit or on a.
  /// unit (see `ScanSwap`). Not required, so an older client keeps.
  /// compiling.
  ///
  final bool? notInterchangeable;

  /// Connectors carrying mains voltage it has — on its panel, at a.
  /// cable end or on a loom's way. A product with one is electrical.
  /// equipment and normally needs inspecting.
  ///
  final List<String> mainsConnectors;

  /// The device's built-in connectors, in panel order. Empty on a cable.
  final List<ProductPort>? ports;
  final CatalogProductUnits units;

  Map<String, Object?> toJson() => _$CatalogProductToJson(this);
}
