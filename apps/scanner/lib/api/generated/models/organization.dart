// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'organization.g.dart';

@JsonSerializable()
class Organization {
  const Organization({
    required this.id,
    required this.name,
    required this.color,
    required this.avatarLabel,
    this.shortName,
  });

  factory Organization.fromJson(Map<String, Object?> json) =>
      _$OrganizationFromJson(json);

  final String id;
  final String name;

  /// Abbreviation to prefer wherever space is tight.
  final String? shortName;

  /// Hex colour for the org badge.
  final String color;
  final String avatarLabel;

  Map<String, Object?> toJson() => _$OrganizationToJson(this);
}
