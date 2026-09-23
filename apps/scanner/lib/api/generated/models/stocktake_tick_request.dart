// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'stocktake_tick_request_via.dart';

part 'stocktake_tick_request.g.dart';

@JsonSerializable()
class StocktakeTickRequest {
  const StocktakeTickRequest({
    required this.assetIds,
    required this.locationId,
    required this.via,
  });
  
  factory StocktakeTickRequest.fromJson(Map<String, Object?> json) => _$StocktakeTickRequestFromJson(json);
  
  final List<String> assetIds;
  final String locationId;

  /// Why they are ticked without a scan of their own — for the report.
  final StocktakeTickRequestVia via;

  Map<String, Object?> toJson() => _$StocktakeTickRequestToJson(this);
}
