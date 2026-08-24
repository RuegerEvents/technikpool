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

  /// `SOLD` and `DECOMMISSIONED` are end of life: the unit has left the.
  /// pool, cannot be booked or scanned onto anything, and is omitted from.
  /// listAssets. getAssetByTag still returns it, so a scan of a retired.
  /// sticker explains itself instead of reading as an unknown tag. Such a.
  /// unit is no longer *at* its `location` — that is where it stood when.
  /// it went.
  ///
  final AssetStatus status;
  final Product product;
  final Location location;
  final Organization organization;
  final String? bundleId;

  Map<String, Object?> toJson() => _$AssetToJson(this);
}
