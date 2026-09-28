// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

/// `production`: a member of the org that runs it — anything can be.
/// checked out to it. `lender`: it has the caller's org's units booked.
/// and approved, and only those can be. `none`: read only.
///
@JsonEnum()
enum ProductionCheckoutRole {
  @JsonValue('production')
  production('production'),
  @JsonValue('lender')
  lender('lender'),
  @JsonValue('none')
  none('none'),
  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const ProductionCheckoutRole(this.json);

  factory ProductionCheckoutRole.fromJson(String json) => values.firstWhere(
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
  static List<ProductionCheckoutRole> get $valuesDefined => values.where((value) => value != $unknown).toList();
}
