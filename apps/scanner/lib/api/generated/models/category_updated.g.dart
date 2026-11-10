// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'category_updated.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CategoryUpdated _$CategoryUpdatedFromJson(Map<String, dynamic> json) =>
    CategoryUpdated(
      category: Category.fromJson(json['category'] as Map<String, dynamic>),
      unitsChanged: (json['unitsChanged'] as num).toInt(),
    );

Map<String, dynamic> _$CategoryUpdatedToJson(CategoryUpdated instance) =>
    <String, dynamic>{
      'category': instance.category,
      'unitsChanged': instance.unitsChanged,
    };
