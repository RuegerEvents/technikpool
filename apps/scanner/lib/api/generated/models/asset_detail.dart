// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'asset_status.dart';
import 'asset_transaction.dart';
import 'location.dart';
import 'organization.dart';
import 'product.dart';
import 'production.dart';

part 'asset_detail.g.dart';

@JsonSerializable()
class AssetDetail {
  const AssetDetail({
    required this.id,
    required this.status,
    required this.product,
    required this.location,
    required this.organization,
    required this.currentProduction,
    required this.history,
    this.assetTag,
    this.serialNumber,
    this.bundleId,
  });
  
  factory AssetDetail.fromJson(Map<String, Object?> json) => _$AssetDetailFromJson(json);
  
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

  /// The production this asset is currently checked out to, if any.
  final Production? currentProduction;

  /// Most recent transactions first.
  final List<AssetTransaction> history;

  Map<String, Object?> toJson() => _$AssetDetailToJson(this);
}
