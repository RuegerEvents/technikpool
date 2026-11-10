// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

/// Whether the port must be connected for a production's connection.
/// check: `required` alone, or a letter shared by alternatives of which.
/// one is enough. Null when it need not be.
///
@JsonEnum()
enum PortRequirement {
  /// The name has been replaced because it contains a keyword. Original name: `required`.
  @JsonValue('required')
  valueRequired('required'),
  @JsonValue('A')
  a('A'),
  @JsonValue('B')
  b('B'),
  /// The name has been replaced because it contains a keyword. Original name: `null`.
  @JsonValue(null)
  valueNull(null),
  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const PortRequirement(this.json);

  factory PortRequirement.fromJson(String? json) => values.firstWhere(
        (e) => e.json == json,
        orElse: () => $unknown,
      );

  final String? json;
  String? toJson() {
    final value = json;
    if (value == null) {
      throw StateError('Cannot convert enum value with null JSON representation to String?. '
          'This usually happens for \$unknown or @JsonValue(null) entries.');
    }
    return value as String?;
  }

  @override
  String toString() => json?.toString() ?? super.toString();
  /// Returns all defined enum values excluding the $unknown value.
  static List<PortRequirement> get $valuesDefined => values.where((value) => value != $unknown).toList();
}
