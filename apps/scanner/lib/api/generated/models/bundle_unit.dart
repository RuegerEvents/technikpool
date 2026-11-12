// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'location_ref.dart';

part 'bundle_unit.g.dart';

@JsonSerializable()
class BundleUnit {
  const BundleUnit({
    required this.id,
    required this.assetTag,
    required this.serialNumber,
    required this.orgIndex,
    required this.status,
    required this.parentAssetId,
    required this.productId,
    required this.productName,
    required this.productCaption,
    required this.manufacturerName,
    required this.productImageUrl,
    required this.location,
    required this.checkedOutTo,
  });
  
  factory BundleUnit.fromJson(Map<String, Object?> json) => _$BundleUnitFromJson(json);
  
  final String id;
  final String? assetTag;
  final String? serialNumber;
  final int orgIndex;
  final String status;

  /// Set on an accessory; it follows the unit with this id.
  final String? parentAssetId;
  final String productId;
  final String productName;
  final String? productCaption;
  final String? manufacturerName;
  final String? productImageUrl;
  final LocationRef location;

  /// The production it is out on, if any.
  final String? checkedOutTo;

  Map<String, Object?> toJson() => _$BundleUnitToJson(this);
}
