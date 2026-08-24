// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'address.g.dart';

@JsonSerializable()
class Address {
  const Address({
    required this.id,
    required this.line1,
    required this.postalCode,
    required this.city,
    this.line2,
  });

  factory Address.fromJson(Map<String, Object?> json) => _$AddressFromJson(json);

  final String id;
  final String line1;
  final String? line2;
  final String postalCode;
  final String city;

  Map<String, Object?> toJson() => _$AddressToJson(this);
}
