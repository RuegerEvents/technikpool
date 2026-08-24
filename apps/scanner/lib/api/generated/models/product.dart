// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

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
  });
  
  factory Product.fromJson(Map<String, Object?> json) => _$ProductFromJson(json);
  
  final String id;
  final String name;
  final String manufacturerName;
  final Category category;
  final String? imageUrl;

  Map<String, Object?> toJson() => _$ProductToJson(this);
}
