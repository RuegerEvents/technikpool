// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'loose_group.g.dart';

@JsonSerializable()
class LooseGroup {
  const LooseGroup({
    required this.key,
    required this.productId,
    required this.locationId,
    required this.productName,
    required this.productCaption,
    required this.productImageUrl,
    required this.manufacturerName,
    required this.locationName,
    required this.available,
    required this.untagged,
  });
  
  factory LooseGroup.fromJson(Map<String, Object?> json) => _$LooseGroupFromJson(json);
  
  final String key;
  final String productId;
  final String locationId;
  final String productName;
  final String? productCaption;
  final String? productImageUrl;
  final String? manufacturerName;
  final String locationName;
  final int available;
  final int untagged;

  Map<String, Object?> toJson() => _$LooseGroupToJson(this);
}
