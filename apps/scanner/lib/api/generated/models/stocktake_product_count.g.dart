// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'stocktake_product_count.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StocktakeProductCount _$StocktakeProductCountFromJson(
  Map<String, dynamic> json,
) => StocktakeProductCount(
  productId: json['productId'] as String,
  productName: json['productName'] as String,
  manufacturerName: json['manufacturerName'] as String?,
  category: Category.fromJson(json['category'] as Map<String, dynamic>),
  expected: (json['expected'] as num).toInt(),
  out: (json['out'] as num).toInt(),
  counted: (json['counted'] as num).toInt(),
  locations: (json['locations'] as List<dynamic>)
      .map((e) => StocktakeLocationCount.fromJson(e as Map<String, dynamic>))
      .toList(),
  cable: json['cable'] == null
      ? null
      : CableSpec.fromJson(json['cable'] as Map<String, dynamic>),
);

Map<String, dynamic> _$StocktakeProductCountToJson(
  StocktakeProductCount instance,
) => <String, dynamic>{
  'productId': instance.productId,
  'productName': instance.productName,
  'manufacturerName': ?instance.manufacturerName,
  'category': instance.category,
  'cable': ?instance.cable,
  'expected': instance.expected,
  'out': instance.out,
  'counted': instance.counted,
  'locations': instance.locations,
};
