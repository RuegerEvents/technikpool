// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'product_inspection_requirement.g.dart';

@JsonSerializable()
class ProductInspectionRequirement {
  const ProductInspectionRequirement({
    required this.typeId,
    required this.requiredValue,
    required this.override,
  });
  
  factory ProductInspectionRequirement.fromJson(Map<String, Object?> json) => _$ProductInspectionRequirementFromJson(json);
  
  final String typeId;

  /// The answer that applies, after the category default. A licence needs none.
  /// The name has been replaced because it contains a keyword. Original name: `required`.
  @JsonKey(name: 'required')
  final bool requiredValue;

  /// The product's own answer. Null follows its category.
  final bool? override;

  Map<String, Object?> toJson() => _$ProductInspectionRequirementToJson(this);
}
