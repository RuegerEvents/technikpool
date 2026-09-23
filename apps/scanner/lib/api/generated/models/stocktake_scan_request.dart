// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'stocktake_scan_request.g.dart';

@JsonSerializable()
class StocktakeScanRequest {
  const StocktakeScanRequest({
    required this.code,
    required this.locationId,
  });
  
  factory StocktakeScanRequest.fromJson(Map<String, Object?> json) => _$StocktakeScanRequestFromJson(json);
  
  /// Exactly what the barcode decoded to.
  final String code;

  /// Where the counter is. One of the stocktake's `countingLocations`.
  final String locationId;

  Map<String, Object?> toJson() => _$StocktakeScanRequestToJson(this);
}
