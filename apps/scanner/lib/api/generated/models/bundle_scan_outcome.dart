// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

@JsonEnum()
enum BundleScanOutcome {
  @JsonValue('added')
  added('added'),
  @JsonValue('already_in')
  alreadyIn('already_in'),
  @JsonValue('in_other_bundle')
  inOtherBundle('in_other_bundle'),
  @JsonValue('not_found')
  notFound('not_found'),
  @JsonValue('ambiguous')
  ambiguous('ambiguous'),
  @JsonValue('is_bundle')
  isBundle('is_bundle'),
  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const BundleScanOutcome(this.json);

  factory BundleScanOutcome.fromJson(String json) => values.firstWhere(
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
  static List<BundleScanOutcome> get $valuesDefined => values.where((value) => value != $unknown).toList();
}
