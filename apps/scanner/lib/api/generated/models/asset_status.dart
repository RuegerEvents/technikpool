// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

/// `SOLD` and `DECOMMISSIONED` are end of life: the unit has left the.
/// pool, cannot be booked or scanned onto anything, and is omitted from.
/// listAssets. getAssetByTag still returns it, so a scan of a retired.
/// sticker explains itself instead of reading as an unknown tag. Such a.
/// unit is no longer *at* its `location` — that is where it stood when.
/// it went.
///
@JsonEnum()
enum AssetStatus {
  @JsonValue('AVAILABLE')
  available('AVAILABLE'),
  @JsonValue('MAINTENANCE')
  maintenance('MAINTENANCE'),
  @JsonValue('BROKEN')
  broken('BROKEN'),
  @JsonValue('SOLD')
  sold('SOLD'),
  @JsonValue('DECOMMISSIONED')
  decommissioned('DECOMMISSIONED'),
  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const AssetStatus(this.json);

  factory AssetStatus.fromJson(String json) => values.firstWhere(
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
  static List<AssetStatus> get $valuesDefined => values.where((value) => value != $unknown).toList();
}
