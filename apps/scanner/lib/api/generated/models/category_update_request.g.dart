// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'category_update_request.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CategoryUpdateRequest _$CategoryUpdateRequestFromJson(
  Map<String, dynamic> json,
) => CategoryUpdateRequest(
  name: json['name'] as String?,
  color: json['color'] as String?,
  sortOrder: (json['sortOrder'] as num?)?.toInt(),
  requiresInspection: json['requiresInspection'] as bool?,
  inspections: (json['inspections'] as Map<String, dynamic>?)?.map(
    (k, e) => MapEntry(k, e as bool),
  ),
);

Map<String, dynamic> _$CategoryUpdateRequestToJson(
  CategoryUpdateRequest instance,
) => <String, dynamic>{
  'name': ?instance.name,
  'color': ?instance.color,
  'sortOrder': ?instance.sortOrder,
  'requiresInspection': ?instance.requiresInspection,
  'inspections': ?instance.inspections,
};
