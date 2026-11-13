// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'bundle_scan_request.g.dart';

@JsonSerializable()
class BundleScanRequest {
  const BundleScanRequest({
    required this.code,
    this.moveFromOtherBundle,
  });
  
  factory BundleScanRequest.fromJson(Map<String, Object?> json) => _$BundleScanRequestFromJson(json);
  
  final String code;

  /// The user agreed to take the unit (or kit) out of the kit it is in.
  final bool? moveFromOtherBundle;

  Map<String, Object?> toJson() => _$BundleScanRequestToJson(this);
}
