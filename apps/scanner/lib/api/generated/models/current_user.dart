// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'organization.dart';
import 'user.dart';

part 'current_user.g.dart';

@JsonSerializable()
class CurrentUser {
  const CurrentUser({
    required this.user,
    required this.isAdmin,
    required this.organizations,
  });

  factory CurrentUser.fromJson(Map<String, Object?> json) => _$CurrentUserFromJson(json);

  final User user;

  /// System-level admin, sees every organization.
  final bool isAdmin;
  final List<Organization> organizations;

  Map<String, Object?> toJson() => _$CurrentUserToJson(this);
}
