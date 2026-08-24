// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'product.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

Product _$ProductFromJson(Map<String, dynamic> json) => Product(
  id: json['id'] as String,
  name: json['name'] as String,
  manufacturerName: json['manufacturerName'] as String,
  categoryName: json['categoryName'] as String,
  imageUrl: json['imageUrl'] as String?,
);

Map<String, dynamic> _$ProductToJson(Product instance) => <String, dynamic>{
  'id': instance.id,
  'name': instance.name,
  'manufacturerName': instance.manufacturerName,
  'categoryName': instance.categoryName,
  'imageUrl': ?instance.imageUrl,
};
