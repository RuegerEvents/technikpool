// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'handover_result.g.dart';

@JsonSerializable()
class HandoverResult {
  const HandoverResult({
    required this.count,
  });
  
  factory HandoverResult.fromJson(Map<String, Object?> json) => _$HandoverResultFromJson(json);
  
  final int count;

  Map<String, Object?> toJson() => _$HandoverResultToJson(this);
}
