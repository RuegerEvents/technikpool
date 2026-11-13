// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'pack_case_ref.dart';

part 'pack_case.g.dart';

@JsonSerializable()
class PackCase {
  const PackCase({
    required this.assetId,
    required this.name,
    required this.tag,
    required this.orgIndex,
    required this.path,
  });
  
  factory PackCase.fromJson(Map<String, Object?> json) => _$PackCaseFromJson(json);
  
  final String assetId;

  /// The product's name with its caption.
  final String name;
  final String? tag;

  /// The unit's number in its organization.
  final int orgIndex;

  /// The cases around this one, outermost first, ending with the.
  /// one it sits in. Empty for a case packed in nothing.
  ///
  final List<PackCaseRef> path;

  Map<String, Object?> toJson() => _$PackCaseToJson(this);
}
