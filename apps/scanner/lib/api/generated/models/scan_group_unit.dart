// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'scan_group_unit.g.dart';

@JsonSerializable()
class ScanGroupUnit {
  const ScanGroupUnit({
    required this.id,
    required this.assetTag,
    required this.productName,
    required this.manufacturerName,
    required this.done,
    this.productCaption,
  });
  
  factory ScanGroupUnit.fromJson(Map<String, Object?> json) => _$ScanGroupUnitFromJson(json);
  
  final String id;
  final String? assetTag;
  final String productName;
  final String? manufacturerName;

  /// The product's caption (see Product.caption), to be shown after the.
  /// product name. Not required, so an older client keeps compiling.
  ///
  final String? productCaption;

  /// Already at the scan's target; nothing to book.
  final bool done;

  Map<String, Object?> toJson() => _$ScanGroupUnitToJson(this);
}
