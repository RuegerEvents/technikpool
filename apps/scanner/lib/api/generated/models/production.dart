// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'organization.dart';

part 'production.g.dart';

@JsonSerializable()
class Production {
  const Production({
    required this.id,
    required this.name,
    required this.organization,
    this.startDate,
    this.endDate,
  });

  factory Production.fromJson(Map<String, Object?> json) => _$ProductionFromJson(json);

  final String id;
  final String name;
  final DateTime? startDate;
  final DateTime? endDate;
  final Organization organization;

  Map<String, Object?> toJson() => _$ProductionToJson(this);
}
