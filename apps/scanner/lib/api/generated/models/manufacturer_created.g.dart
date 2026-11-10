// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'manufacturer_created.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ManufacturerCreated _$ManufacturerCreatedFromJson(Map<String, dynamic> json) =>
    ManufacturerCreated(
      manufacturer: Manufacturer.fromJson(
        json['manufacturer'] as Map<String, dynamic>,
      ),
      created: json['created'] as bool,
    );

Map<String, dynamic> _$ManufacturerCreatedToJson(
  ManufacturerCreated instance,
) => <String, dynamic>{
  'manufacturer': instance.manufacturer,
  'created': instance.created,
};
