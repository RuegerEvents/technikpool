// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'manufacturer_merged.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ManufacturerMerged _$ManufacturerMergedFromJson(Map<String, dynamic> json) =>
    ManufacturerMerged(
      manufacturer: Manufacturer.fromJson(
        json['manufacturer'] as Map<String, dynamic>,
      ),
      movedProducts: (json['movedProducts'] as num).toInt(),
    );

Map<String, dynamic> _$ManufacturerMergedToJson(ManufacturerMerged instance) =>
    <String, dynamic>{
      'manufacturer': instance.manufacturer,
      'movedProducts': instance.movedProducts,
    };
