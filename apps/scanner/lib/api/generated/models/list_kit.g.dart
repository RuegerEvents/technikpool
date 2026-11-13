// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'list_kit.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ListKit _$ListKitFromJson(Map<String, dynamic> json) => ListKit(
  id: json['id'] as String,
  name: json['name'] as String,
  tag: json['tag'] as String?,
  parent: json['parent'] == null
      ? null
      : KitRef.fromJson(json['parent'] as Map<String, dynamic>),
);

Map<String, dynamic> _$ListKitToJson(ListKit instance) => <String, dynamic>{
  'id': instance.id,
  'name': instance.name,
  'tag': ?instance.tag,
  'parent': ?instance.parent,
};
