// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'product_merged.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ProductMerged _$ProductMergedFromJson(Map<String, dynamic> json) =>
    ProductMerged(
      product: CatalogProduct.fromJson(json['product'] as Map<String, dynamic>),
      movedUnits: (json['movedUnits'] as num).toInt(),
      inheritedImage: json['inheritedImage'] as bool,
      inheritedCable: json['inheritedCable'] as bool,
      inheritedLicense: json['inheritedLicense'] as bool,
    );

Map<String, dynamic> _$ProductMergedToJson(ProductMerged instance) =>
    <String, dynamic>{
      'product': instance.product,
      'movedUnits': instance.movedUnits,
      'inheritedImage': instance.inheritedImage,
      'inheritedCable': instance.inheritedCable,
      'inheritedLicense': instance.inheritedLicense,
    };
