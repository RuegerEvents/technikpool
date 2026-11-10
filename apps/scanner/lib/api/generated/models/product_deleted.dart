// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'product_deleted.g.dart';

@JsonSerializable()
class ProductDeleted {
  const ProductDeleted({
    required this.id,
  });
  
  factory ProductDeleted.fromJson(Map<String, Object?> json) => _$ProductDeletedFromJson(json);
  
  final String id;

  Map<String, Object?> toJson() => _$ProductDeletedToJson(this);
}
