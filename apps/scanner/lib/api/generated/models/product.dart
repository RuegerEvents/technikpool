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
    this.imageUrl,
    this.cable,
  });
  
  factory Product.fromJson(Map<String, Object?> json) => _$ProductFromJson(json);
  
  final String id;
  final String name;
  final String manufacturerName;
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
