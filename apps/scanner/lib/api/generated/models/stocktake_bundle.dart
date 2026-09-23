// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'stocktake_bundle.g.dart';

@JsonSerializable()
class StocktakeBundle {
  const StocktakeBundle({
    required this.id,
    required this.name,
    this.tag,
  });
  
  factory StocktakeBundle.fromJson(Map<String, Object?> json) => _$StocktakeBundleFromJson(json);
  
  final String id;
  final String? tag;
  final String name;

  Map<String, Object?> toJson() => _$StocktakeBundleToJson(this);
}
