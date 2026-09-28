// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'case_check_result.g.dart';

@JsonSerializable()
class CaseCheckResult {
  const CaseCheckResult({
    required this.found,
    required this.missing,
    required this.away,
  });
  
  factory CaseCheckResult.fromJson(Map<String, Object?> json) => _$CaseCheckResultFromJson(json);
  
  final int found;
  final int missing;

  /// Not found, but checked out to another production.
  final int away;

  Map<String, Object?> toJson() => _$CaseCheckResultToJson(this);
}
