// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'product_update_request.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ProductUpdateRequest _$ProductUpdateRequestFromJson(
  Map<String, dynamic> json,
) => ProductUpdateRequest(
  name: json['name'] as String?,
  caption: json['caption'] as String?,
  details: json['details'] as String?,
  manufacturerId: json['manufacturerId'] as String?,
  categoryId: json['categoryId'] as String?,
  isLicense: json['isLicense'] as bool?,
  requiresInspection: json['requiresInspection'] as bool?,
  inspections: (json['inspections'] as Map<String, dynamic>?)?.map(
    (k, e) => MapEntry(k, e as bool?),
  ),
  cable: json['cable'] == null
      ? null
      : CableUpdate.fromJson(json['cable'] as Map<String, dynamic>),
  ports: (json['ports'] as List<dynamic>?)
      ?.map((e) => ProductPortInput.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$ProductUpdateRequestToJson(
  ProductUpdateRequest instance,
) => <String, dynamic>{
  'name': ?instance.name,
  'caption': ?instance.caption,
  'details': ?instance.details,
  'manufacturerId': ?instance.manufacturerId,
  'categoryId': ?instance.categoryId,
  'isLicense': ?instance.isLicense,
  'requiresInspection': ?instance.requiresInspection,
  'inspections': ?instance.inspections,
  'cable': ?instance.cable,
  'ports': ?instance.ports,
};
