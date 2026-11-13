// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'error.g.dart';

@JsonSerializable()
class Error {
  const Error({
    required this.code,
    required this.message,
    this.params,
  });
  
  factory Error.fromJson(Map<String, Object?> json) => _$ErrorFromJson(json);
  
  /// Stable machine-readable identifier.
  final String code;

  /// Human-readable text, safe to show to the operator.
  final String message;

  /// Values a client's own wording of `code` names, by position —.
  /// the kits of a `kit_*` refusal. Left out where the code needs.
  /// none.
  ///
  final List<String>? params;

  Map<String, Object?> toJson() => _$ErrorToJson(this);
}
