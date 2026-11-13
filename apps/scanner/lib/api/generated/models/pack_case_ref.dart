// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'pack_case_ref.g.dart';

/// A pack case: an ordinary unit whose product is a container and that.
/// is in no bundle. Show.
/// it as "Case 3 (Transflex 60×40)" — its tag, else "#" and its number,.
/// then the product.
///
@JsonSerializable()
class PackCaseRef {
  const PackCaseRef({
    required this.assetId,
    required this.name,
    required this.tag,
    required this.orgIndex,
  });
  
  factory PackCaseRef.fromJson(Map<String, Object?> json) => _$PackCaseRefFromJson(json);
  
  final String assetId;

  /// The product's name with its caption.
  final String name;
  final String? tag;

  /// The unit's number in its organization.
  final int orgIndex;

  Map<String, Object?> toJson() => _$PackCaseRefToJson(this);
}
