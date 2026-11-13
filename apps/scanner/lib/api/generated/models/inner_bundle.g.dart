// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'inner_bundle.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

InnerBundle _$InnerBundleFromJson(Map<String, dynamic> json) => InnerBundle(
  id: json['id'] as String,
  name: json['name'] as String,
  caption: json['caption'] as String?,
  tag: json['tag'] as String?,
  imageUrl: json['imageUrl'] as String?,
  unitCount: (json['unitCount'] as num).toInt(),
);

Map<String, dynamic> _$InnerBundleToJson(InnerBundle instance) =>
    <String, dynamic>{
      'id': instance.id,
      'name': instance.name,
      'caption': ?instance.caption,
      'tag': ?instance.tag,
      'imageUrl': ?instance.imageUrl,
      'unitCount': instance.unitCount,
    };
