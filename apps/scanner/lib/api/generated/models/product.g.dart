// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'product.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

Product _$ProductFromJson(Map<String, dynamic> json) => Product(
  id: json['id'] as String,
  name: json['name'] as String,
  manufacturerName: json['manufacturerName'] as String,
  category: Category.fromJson(json['category'] as Map<String, dynamic>),
  imageUrl: json['imageUrl'] as String?,
  cable: json['cable'] == null
      ? null
      : CableSpec.fromJson(json['cable'] as Map<String, dynamic>),
);

Map<String, dynamic> _$ProductToJson(Product instance) => <String, dynamic>{
  'id': instance.id,
  'name': instance.name,
  'manufacturerName': instance.manufacturerName,
  'category': instance.category,
  'imageUrl': ?instance.imageUrl,
  'cable': ?instance.cable,
};
