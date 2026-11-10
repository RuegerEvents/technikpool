// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'manufacturer.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

Manufacturer _$ManufacturerFromJson(Map<String, dynamic> json) => Manufacturer(
  id: json['id'] as String,
  name: json['name'] as String,
  productCount: (json['productCount'] as num).toInt(),
);

Map<String, dynamic> _$ManufacturerToJson(Manufacturer instance) =>
    <String, dynamic>{
      'id': instance.id,
      'name': instance.name,
      'productCount': instance.productCount,
    };
