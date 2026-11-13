// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'kit_ref.dart';
import 'location_ref.dart';

part 'bundle_summary.g.dart';

@JsonSerializable()
class BundleSummary {
  const BundleSummary({
    required this.id,
    required this.name,
    required this.caption,
    required this.tag,
    required this.imageUrl,
    required this.categoryName,
    required this.organizationId,
    required this.location,
    required this.unitCount,
    required this.parentBundle,
  });
  
  factory BundleSummary.fromJson(Map<String, Object?> json) => _$BundleSummaryFromJson(json);
  
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

  /// Units in it, not counting accessories or the units of kits inside it.
  final int unitCount;

  /// The kit this one sits inside, if any. Kits nest one level deep.
  final KitRef? parentBundle;

  Map<String, Object?> toJson() => _$BundleSummaryToJson(this);
}
