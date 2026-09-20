// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'member_organization.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

MemberOrganization _$MemberOrganizationFromJson(Map<String, dynamic> json) =>
    MemberOrganization(
      id: json['id'] as String,
      name: json['name'] as String,
      color: json['color'] as String,
      avatarLabel: json['avatarLabel'] as String,
      shortName: json['shortName'] as String?,
      role: json['role'] == null
          ? null
          : MemberOrganizationRole.fromJson(json['role'] as String),
    );

Map<String, dynamic> _$MemberOrganizationToJson(MemberOrganization instance) =>
    <String, dynamic>{
      'id': instance.id,
      'name': instance.name,
      'shortName': ?instance.shortName,
      'color': instance.color,
      'avatarLabel': instance.avatarLabel,
      'role': ?instance.role,
    };
