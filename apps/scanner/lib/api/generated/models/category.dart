// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'category.g.dart';

@JsonSerializable()
class Category {
  const Category({
    required this.id,
    required this.name,
    required this.color,
    required this.sortOrder,
    this.requiresInspection,
  });
  
  factory Category.fromJson(Map<String, Object?> json) => _$CategoryFromJson(json);
  
  final String id;
  final String name;

  /// Hex, `#rrggbb`. User-chosen and unconstrained, so it runs from white.
  /// to near-black — derive the text colour from its luminance rather.
  /// than assuming a dark background.
  ///
  final String color;

  /// Ascending, ties broken by name. listCategories applies both.
  final int sortOrder;

  /// Whether units in this category need DGUV inspections, unless their.
  /// product says otherwise. Not required, so an older client keeps.
  /// compiling.
  ///
  final bool? requiresInspection;

  Map<String, Object?> toJson() => _$CategoryToJson(this);
}
