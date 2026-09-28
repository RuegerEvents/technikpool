// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'production_check_unexpected.g.dart';

@JsonSerializable()
class ProductionCheckUnexpected {
  const ProductionCheckUnexpected({
    required this.assetId,
    required this.assetTag,
    required this.productName,
    required this.userName,
    required this.mine,
  });
  
  factory ProductionCheckUnexpected.fromJson(Map<String, Object?> json) => _$ProductionCheckUnexpectedFromJson(json);
  
  final String assetId;
  final String? assetTag;
  final String productName;
  final String userName;
  final bool mine;

  Map<String, Object?> toJson() => _$ProductionCheckUnexpectedToJson(this);
}
