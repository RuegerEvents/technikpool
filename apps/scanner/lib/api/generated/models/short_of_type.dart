// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'short_of_type.g.dart';

@JsonSerializable()
class ShortOfType {
  const ShortOfType({
    required this.name,
    required this.missing,
  });
  
  factory ShortOfType.fromJson(Map<String, Object?> json) => _$ShortOfTypeFromJson(json);
  
  final String name;
  final int missing;

  Map<String, Object?> toJson() => _$ShortOfTypeToJson(this);
}
