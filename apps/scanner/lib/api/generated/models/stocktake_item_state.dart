// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

/// `open` is not counted yet; it turns into `missing` when the.
/// stocktake closes. `out` was checked out on a production at the.
/// start and is accounted for. `unexpected` was scanned although it.
/// is not on the list — see `unexpectedReason`.
///
@JsonEnum()
enum StocktakeItemState {
  @JsonValue('open')
  open('open'),
  @JsonValue('found')
  found('found'),
  @JsonValue('out')
  out('out'),
  @JsonValue('missing')
  missing('missing'),
  @JsonValue('unexpected')
  unexpected('unexpected'),
  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const StocktakeItemState(this.json);

  factory StocktakeItemState.fromJson(String json) => values.firstWhere(
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
  static List<StocktakeItemState> get $valuesDefined => values.where((value) => value != $unknown).toList();
}
