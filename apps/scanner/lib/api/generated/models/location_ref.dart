// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'location_ref.g.dart';

@JsonSerializable()
class LocationRef {
  const LocationRef({
    required this.id,
    required this.name,
  });
  
  factory LocationRef.fromJson(Map<String, Object?> json) => _$LocationRefFromJson(json);
  
  final String id;
  final String name;

  Map<String, Object?> toJson() => _$LocationRefToJson(this);
}
