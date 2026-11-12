// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'catalog_product.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CatalogProduct _$CatalogProductFromJson(
  Map<String, dynamic> json,
) => CatalogProduct(
  id: json['id'] as String,
  name: json['name'] as String,
  manufacturerName: json['manufacturerName'] as String?,
  category: Category.fromJson(json['category'] as Map<String, dynamic>),
  requiresInspection: json['requiresInspection'] as bool?,
  inspectionRequired: json['inspectionRequired'] as bool,
  isLicense: json['isLicense'] as bool,
  mainsConnectors: (json['mainsConnectors'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  units: CatalogProductUnits.fromJson(json['units'] as Map<String, dynamic>),
  caption: json['caption'] as String?,
  details: json['details'] as String?,
  imageUrl: json['imageUrl'] as String?,
  cable: json['cable'] == null
      ? null
      : CableSpec.fromJson(json['cable'] as Map<String, dynamic>),
  inspections: (json['inspections'] as List<dynamic>?)
      ?.map(
        (e) => ProductInspectionRequirement.fromJson(e as Map<String, dynamic>),
      )
      .toList(),
  ports: (json['ports'] as List<dynamic>?)
      ?.map((e) => ProductPort.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$CatalogProductToJson(CatalogProduct instance) =>
    <String, dynamic>{
      'id': instance.id,
      'name': instance.name,
      'manufacturerName': ?instance.manufacturerName,
      'caption': ?instance.caption,
      'details': ?instance.details,
      'category': instance.category,
      'imageUrl': ?instance.imageUrl,
      'cable': ?instance.cable,
      'requiresInspection': ?instance.requiresInspection,
      'inspectionRequired': instance.inspectionRequired,
      'inspections': ?instance.inspections,
      'isLicense': instance.isLicense,
      'mainsConnectors': instance.mainsConnectors,
      'ports': ?instance.ports,
      'units': instance.units,
    };
