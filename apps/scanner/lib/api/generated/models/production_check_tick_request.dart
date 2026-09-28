// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'production_check_tick_request.g.dart';

@JsonSerializable()
class ProductionCheckTickRequest {
  const ProductionCheckTickRequest({
    required this.assetIds,
  });
  
  factory ProductionCheckTickRequest.fromJson(Map<String, Object?> json) => _$ProductionCheckTickRequestFromJson(json);
  
  final List<String> assetIds;

  Map<String, Object?> toJson() => _$ProductionCheckTickRequestToJson(this);
}
