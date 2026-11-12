// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'handout_addition.g.dart';

@JsonSerializable()
class HandoutAddition {
  const HandoutAddition({
    required this.key,
    required this.productId,
    required this.organizationId,
    required this.locationId,
    required this.productName,
    required this.productCaption,
    required this.productImageUrl,
    required this.manufacturerName,
    required this.locationName,
    required this.organizationName,
    required this.available,
    required this.untagged,
  });
  
  factory HandoutAddition.fromJson(Map<String, Object?> json) => _$HandoutAdditionFromJson(json);
  
  final String key;
  final String productId;

  /// The units' owner.
  final String organizationId;
  final String locationId;
  final String productName;
  final String? productCaption;
  final String? productImageUrl;
  final String? manufacturerName;
  final String locationName;
  final String organizationName;

  /// Free for the production's dates, not out anywhere, not on it already.
  final int available;

  /// Of those, how many carry no tag.
  final int untagged;

  Map<String, Object?> toJson() => _$HandoutAdditionToJson(this);
}
