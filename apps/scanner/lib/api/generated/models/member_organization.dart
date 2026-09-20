// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'member_organization_role.dart';

part 'member_organization.g.dart';

/// An organization the caller belongs to, and the rung they stand on in it. Spelled out rather than composed from Organization because only this response carries a role: an organization named by an asset or a production is a label, not a statement about the caller.
@JsonSerializable()
class MemberOrganization {
  const MemberOrganization({
    required this.id,
    required this.name,
    required this.color,
    required this.avatarLabel,
    this.shortName,
    this.role,
  });
  
  factory MemberOrganization.fromJson(Map<String, Object?> json) => _$MemberOrganizationFromJson(json);
  
  final String id;
  final String name;

  /// Abbreviation to prefer wherever space is tight.
  final String? shortName;

  /// Hex colour for the org badge.
  final String color;
  final String avatarLabel;

  /// What the caller may do here, as a ladder: each rung can do everything below it. DEVICE_VIEWER sees the equipment only — booking or returning anything needs MEMBER or above, so a client can stop offering a scan that the server will refuse.
  /// Absent where there is no membership at all, which only happens for a system admin: `isAdmin` is what grants them that organization. Omitted rather than null so the value stays a plain enum — a null member generates an unusable identifier in the Dart client.
  final MemberOrganizationRole? role;

  Map<String, Object?> toJson() => _$MemberOrganizationToJson(this);
}
