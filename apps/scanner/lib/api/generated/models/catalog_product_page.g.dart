// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'catalog_product_page.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CatalogProductPage _$CatalogProductPageFromJson(Map<String, dynamic> json) =>
    CatalogProductPage(
      items: (json['items'] as List<dynamic>)
          .map((e) => CatalogProduct.fromJson(e as Map<String, dynamic>))
          .toList(),
      nextCursor: json['nextCursor'] as String?,
    );

Map<String, dynamic> _$CatalogProductPageToJson(CatalogProductPage instance) =>
    <String, dynamic>{
      'items': instance.items,
      'nextCursor': ?instance.nextCursor,
    };
