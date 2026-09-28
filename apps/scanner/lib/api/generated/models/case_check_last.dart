// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'case_check_last.g.dart';

@JsonSerializable()
class CaseCheckLast {
  const CaseCheckLast({
    required this.at,
    required this.userName,
    required this.found,
    required this.expected,
  });
  
  factory CaseCheckLast.fromJson(Map<String, Object?> json) => _$CaseCheckLastFromJson(json);
  
  final DateTime at;
  final String userName;
  final int found;
  final int expected;

  Map<String, Object?> toJson() => _$CaseCheckLastToJson(this);
}
