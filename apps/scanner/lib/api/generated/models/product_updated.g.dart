// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'product_updated.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ProductUpdated _$ProductUpdatedFromJson(Map<String, dynamic> json) =>
    ProductUpdated(
      product: CatalogProduct.fromJson(json['product'] as Map<String, dynamic>),
      unitsChanged: (json['unitsChanged'] as num).toInt(),
    );

Map<String, dynamic> _$ProductUpdatedToJson(ProductUpdated instance) =>
    <String, dynamic>{
      'product': instance.product,
      'unitsChanged': instance.unitsChanged,
    };
