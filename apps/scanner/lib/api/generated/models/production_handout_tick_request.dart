// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'production_handout_tick_request.g.dart';

@JsonSerializable()
class ProductionHandoutTickRequest {
  const ProductionHandoutTickRequest({
    required this.assetIds,
    required this.done,
  });
  
  factory ProductionHandoutTickRequest.fromJson(Map<String, Object?> json) => _$ProductionHandoutTickRequestFromJson(json);
  
  final List<String> assetIds;
  final bool done;

  Map<String, Object?> toJson() => _$ProductionHandoutTickRequestToJson(this);
}
