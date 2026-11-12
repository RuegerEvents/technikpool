// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'bundle_create_request.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BundleCreateRequest _$BundleCreateRequestFromJson(Map<String, dynamic> json) =>
    BundleCreateRequest(
      organizationId: json['organizationId'] as String,
      name: json['name'] as String,
      categoryId: json['categoryId'] as String,
      caption: json['caption'] as String?,
      tag: json['tag'] as String?,
    );

Map<String, dynamic> _$BundleCreateRequestToJson(
  BundleCreateRequest instance,
) => <String, dynamic>{
  'organizationId': instance.organizationId,
  'name': instance.name,
  'categoryId': instance.categoryId,
  'caption': ?instance.caption,
  'tag': ?instance.tag,
};
