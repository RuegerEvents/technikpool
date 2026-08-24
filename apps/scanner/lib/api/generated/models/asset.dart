// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'asset_status.dart';
import 'location.dart';
import 'organization.dart';
import 'product.dart';

part 'asset.g.dart';

@JsonSerializable()
class Asset {
  const Asset({
    required this.id,
    required this.status,
    required this.product,
    required this.location,
    required this.organization,
    this.assetTag,
    this.serialNumber,
    this.bundleId,
  });

  factory Asset.fromJson(Map<String, Object?> json) => _$AssetFromJson(json);

  final String id;

  /// The printed tag. Null for assets that have never been labelled.
  final String? assetTag;
  final String? serialNumber;
  final AssetStatus status;
  final Product product;
  final Location location;
  final Organization organization;
  final String? bundleId;

  Map<String, Object?> toJson() => _$AssetToJson(this);
}
