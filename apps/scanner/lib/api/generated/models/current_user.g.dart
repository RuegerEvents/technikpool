// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'current_user.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CurrentUser _$CurrentUserFromJson(Map<String, dynamic> json) => CurrentUser(
  user: User.fromJson(json['user'] as Map<String, dynamic>),
  isAdmin: json['isAdmin'] as bool,
  organizations: (json['organizations'] as List<dynamic>)
      .map((e) => Organization.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$CurrentUserToJson(CurrentUser instance) => <String, dynamic>{
  'user': instance.user,
  'isAdmin': instance.isAdmin,
  'organizations': instance.organizations,
};
