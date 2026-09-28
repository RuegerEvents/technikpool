// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'production_check_start_request.g.dart';

@JsonSerializable()
class ProductionCheckStartRequest {
  const ProductionCheckStartRequest({
    this.organizationId,
  });
  
  factory ProductionCheckStartRequest.fromJson(Map<String, Object?> json) => _$ProductionCheckStartRequestFromJson(json);
  
  /// Which side to check as, for a caller on both.
  final String? organizationId;

  Map<String, Object?> toJson() => _$ProductionCheckStartRequestToJson(this);
}
