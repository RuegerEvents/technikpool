// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'count_result.g.dart';

@JsonSerializable()
class CountResult {
  const CountResult({
    required this.count,
  });
  
  factory CountResult.fromJson(Map<String, Object?> json) => _$CountResultFromJson(json);
  
  final int count;

  Map<String, Object?> toJson() => _$CountResultToJson(this);
}
