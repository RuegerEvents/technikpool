// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'cable_spec.dart';
import 'category.dart';

part 'product.g.dart';

@JsonSerializable()
class Product {
  const Product({
    required this.id,
    required this.name,
    required this.manufacturerName,
    required this.category,
    this.caption,
    this.details,
    this.imageUrl,
    this.cable,
  });
  
  factory Product.fromJson(Map<String, Object?> json) => _$ProductFromJson(json);
  
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

  Map<String, Object?> toJson() => _$ProductToJson(this);
}
