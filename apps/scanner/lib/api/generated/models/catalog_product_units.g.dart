// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'catalog_product_units.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CatalogProductUnits _$CatalogProductUnitsFromJson(Map<String, dynamic> json) =>
    CatalogProductUnits(
      active: (json['active'] as num).toInt(),
      tracked: (json['tracked'] as num).toInt(),
      overdue: (json['overdue'] as num).toInt(),
    );

Map<String, dynamic> _$CatalogProductUnitsToJson(
  CatalogProductUnits instance,
) => <String, dynamic>{
  'active': instance.active,
  'tracked': instance.tracked,
  'overdue': instance.overdue,
};
