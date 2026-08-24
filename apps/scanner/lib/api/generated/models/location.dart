// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'address.dart';
import 'organization.dart';

part 'location.g.dart';

@JsonSerializable()
class Location {
  const Location({
    required this.id,
    required this.name,
    required this.organization,
    this.address,
  });
  
  factory Location.fromJson(Map<String, Object?> json) => _$LocationFromJson(json);
  
  final String id;
  final String name;
  final Organization organization;
  final Address? address;

  Map<String, Object?> toJson() => _$LocationToJson(this);
}
