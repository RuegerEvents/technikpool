// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

/// What the caller may do here, as a ladder: each rung can do everything below it. DEVICE_VIEWER sees the equipment only — booking or returning anything needs MEMBER or above, so a client can stop offering a scan that the server will refuse.
/// Absent where there is no membership at all, which only happens for a system admin: `isAdmin` is what grants them that organization. Omitted rather than null so the value stays a plain enum — a null member generates an unusable identifier in the Dart client.
@JsonEnum()
enum MemberOrganizationRole {
  @JsonValue('DEVICE_VIEWER')
  deviceViewer('DEVICE_VIEWER'),
  @JsonValue('VIEWER')
  viewer('VIEWER'),
  @JsonValue('MEMBER')
  member('MEMBER'),
  @JsonValue('ADMIN')
  admin('ADMIN'),
  @JsonValue('OWNER')
  owner('OWNER'),
  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const MemberOrganizationRole(this.json);

  factory MemberOrganizationRole.fromJson(String json) => values.firstWhere(
        (e) => e.json == json,
        orElse: () => $unknown,
      );

  final String? json;
  String toJson() {
    final value = json;
    if (value == null) {
      throw StateError('Cannot convert enum value with null JSON representation to String. '
          'This usually happens for \$unknown or @JsonValue(null) entries.');
    }
    return value as String;
  }

  @override
  String toString() => json?.toString() ?? super.toString();
  /// Returns all defined enum values excluding the $unknown value.
  static List<MemberOrganizationRole> get $valuesDefined => values.where((value) => value != $unknown).toList();
}
