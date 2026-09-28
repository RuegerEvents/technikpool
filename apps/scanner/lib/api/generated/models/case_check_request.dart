// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'case_kind.dart';

part 'case_check_request.g.dart';

@JsonSerializable()
class CaseCheckRequest {
  const CaseCheckRequest({
    required this.kind,
    required this.id,
    required this.foundAssetIds,
  });
  
  factory CaseCheckRequest.fromJson(Map<String, Object?> json) => _$CaseCheckRequestFromJson(json);
  
  final CaseKind kind;
  final String id;
  final List<String> foundAssetIds;

  Map<String, Object?> toJson() => _$CaseCheckRequestToJson(this);
}
