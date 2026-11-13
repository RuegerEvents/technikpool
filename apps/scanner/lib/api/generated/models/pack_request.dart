// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'production_list_line_count.dart';

part 'pack_request.g.dart';

@JsonSerializable()
class PackRequest {
  const PackRequest({
    this.caseAssetId,
    this.assetIds,
    this.line,
    this.organizationId,
  });
  
  factory PackRequest.fromJson(Map<String, Object?> json) => _$PackRequestFromJson(json);
  
  /// The case to pack into (its asset id). Null or left out takes the.
  /// units out of the case they are in.
  ///
  final String? caseAssetId;

  /// Units, a whole kit's included; accessories go with their unit.
  final List<String>? assetIds;

  /// Part of a counted line — `count` of its units, the ones already out first.
  final ProductionListLineCount? line;

  /// The side the list is seen from, as on the hand-out list.
  final String? organizationId;

  Map<String, Object?> toJson() => _$PackRequestToJson(this);
}
