// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'user.g.dart';

@JsonSerializable()
class User {
  const User({
    required this.id,
    required this.email,
    required this.emailVerified,
    this.name,
    this.image,
  });

  factory User.fromJson(Map<String, Object?> json) => _$UserFromJson(json);

  final String id;
  final String email;
  final String? name;
  final bool emailVerified;
  final String? image;

  Map<String, Object?> toJson() => _$UserToJson(this);
}
