// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'inventory_product.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

InventoryProduct _$InventoryProductFromJson(Map<String, dynamic> json) =>
    InventoryProduct(
      product: Product.fromJson(json['product'] as Map<String, dynamic>),
      organizationId: json['organizationId'] as String,
      organizationName: json['organizationName'] as String,
      count: (json['count'] as num).toInt(),
      available: (json['available'] as num).toInt(),
      untagged: (json['untagged'] as num).toInt(),
    );

Map<String, dynamic> _$InventoryProductToJson(InventoryProduct instance) =>
    <String, dynamic>{
      'product': instance.product,
      'organizationId': instance.organizationId,
      'organizationName': instance.organizationName,
      'count': instance.count,
      'available': instance.available,
      'untagged': instance.untagged,
    };
