// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'bundle_unit.dart';
import 'location_ref.dart';

part 'bundle_detail.g.dart';

@JsonSerializable()
class BundleDetail {
  const BundleDetail({
    required this.id,
    required this.name,
    required this.caption,
    required this.tag,
    required this.imageUrl,
    required this.categoryName,
    required this.organizationId,
    required this.location,
    required this.unitCount,
    required this.units,
    required this.canEdit,
  });
  
  factory BundleDetail.fromJson(Map<String, Object?> json) => _$BundleDetailFromJson(json);
  
  final String id;

  /// The bundle type's name.
  final String name;
  final String? caption;
  final String? tag;
  final String? imageUrl;
  final String categoryName;
  final String organizationId;

  /// The kit's own location; null for one that is wherever its units are.
  final LocationRef? location;

  /// Units in it, not counting accessories.
  final int unitCount;

  /// Each unit followed by its accessories, by product name.
  final List<BundleUnit> units;

  /// Whether the caller may change what it holds (ADMIN or above).
  final bool canEdit;

  Map<String, Object?> toJson() => _$BundleDetailToJson(this);
}
