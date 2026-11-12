// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'product_inspection_requirement.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ProductInspectionRequirement _$ProductInspectionRequirementFromJson(
  Map<String, dynamic> json,
) => ProductInspectionRequirement(
  typeId: json['typeId'] as String,
  requiredValue: json['required'] as bool,
  override: json['override'] as bool?,
);

Map<String, dynamic> _$ProductInspectionRequirementToJson(
  ProductInspectionRequirement instance,
) => <String, dynamic>{
  'typeId': instance.typeId,
  'required': instance.requiredValue,
  'override': ?instance.override,
};
