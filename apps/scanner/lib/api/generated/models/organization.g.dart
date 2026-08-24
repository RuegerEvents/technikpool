// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'organization.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

Organization _$OrganizationFromJson(Map<String, dynamic> json) => Organization(
  id: json['id'] as String,
  name: json['name'] as String,
  color: json['color'] as String,
  avatarLabel: json['avatarLabel'] as String,
  shortName: json['shortName'] as String?,
);

Map<String, dynamic> _$OrganizationToJson(Organization instance) => <String, dynamic>{
  'id': instance.id,
  'name': instance.name,
  'shortName': ?instance.shortName,
  'color': instance.color,
  'avatarLabel': instance.avatarLabel,
};
