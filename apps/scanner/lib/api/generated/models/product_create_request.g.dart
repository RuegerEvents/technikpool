// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'product_create_request.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ProductCreateRequest _$ProductCreateRequestFromJson(
  Map<String, dynamic> json,
) => ProductCreateRequest(
  organizationId: json['organizationId'] as String,
  name: json['name'] as String,
  categoryId: json['categoryId'] as String,
  manufacturerName: json['manufacturerName'] as String?,
  caption: json['caption'] as String?,
);

Map<String, dynamic> _$ProductCreateRequestToJson(
  ProductCreateRequest instance,
) => <String, dynamic>{
  'organizationId': instance.organizationId,
  'name': instance.name,
  'manufacturerName': ?instance.manufacturerName,
  'categoryId': instance.categoryId,
  'caption': ?instance.caption,
};
