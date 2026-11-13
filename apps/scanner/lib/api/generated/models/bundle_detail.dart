// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'bundle_unit.dart';
import 'inner_bundle.dart';
import 'kit_ref.dart';
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
    required this.parentBundle,
    required this.units,
    required this.innerBundles,
    required this.canEdit,
    this.caseUnitId,
    this.number,
    this.numberFromCase,
    this.extraCases,
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

  /// Units in it, not counting accessories or the units of kits inside it.
  final int unitCount;

  /// The kit this one sits inside, if any. Kits nest one level deep.
  final KitRef? parentBundle;

  /// Each unit followed by its accessories, by product name. The.
  /// units of kits inside it are theirs, not listed here.
  ///
  final List<BundleUnit> units;

  /// The kits that sit inside this one, by name.
  final List<InnerBundle> innerBundles;

  /// Whether the caller may change what it holds (ADMIN or above).
  final bool canEdit;

  /// The unit that is the kit's case: the container in it.
  /// (`CatalogProduct.isContainer`), the lowest-numbered of two.
  /// Scanning its tag means the whole kit, as the kit's own tag.
  /// does. Not required, so an older client keeps compiling.
  ///
  final String? caseUnitId;

  /// The kit's number: its own `tag`, else its case's tag, else.
  /// null (a DMX ring). What its label prints. Not required, so an.
  /// older client keeps compiling.
  ///
  final String? number;

  /// `number` is the case's tag — show it as the kit's number. Not.
  /// required, so an older client keeps compiling.
  ///
  final bool? numberFromCase;

  /// More containers in it besides its case; only the lowest unit.
  /// number counts. Worth a hint. Not required, so an older client.
  /// keeps compiling.
  ///
  final int? extraCases;

  Map<String, Object?> toJson() => _$BundleDetailToJson(this);
}
