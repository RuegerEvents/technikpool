// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'ways.g.dart';

@JsonSerializable()
class Ways {
  const Ways({
    required this.count,
    this.type,
    this.connectorA,
    this.connectorB,
  });
  
  factory Ways.fromJson(Map<String, Object?> json) => _$WaysFromJson(json);
  
  final int count;
  final String? type;
  final String? connectorA;
  final String? connectorB;

  Map<String, Object?> toJson() => _$WaysToJson(this);
}
