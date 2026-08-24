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
