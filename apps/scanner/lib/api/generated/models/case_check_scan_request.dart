// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'case_check_scan_request.g.dart';

@JsonSerializable()
class CaseCheckScanRequest {
  const CaseCheckScanRequest({
    required this.code,
    required this.foundAssetIds,
  });
  
  factory CaseCheckScanRequest.fromJson(Map<String, Object?> json) => _$CaseCheckScanRequestFromJson(json);
  
  final String code;

  /// The units ticked so far; none of them is swapped away.
  final List<String> foundAssetIds;

  Map<String, Object?> toJson() => _$CaseCheckScanRequestToJson(this);
}
