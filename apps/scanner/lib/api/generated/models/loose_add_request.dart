// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'loose_add_request.g.dart';

@JsonSerializable()
class LooseAddRequest {
  const LooseAddRequest({
    required this.productId,
    required this.locationId,
    required this.count,
  });
  
  factory LooseAddRequest.fromJson(Map<String, Object?> json) => _$LooseAddRequestFromJson(json);
  
  final String productId;
  final String locationId;
  final int count;

  Map<String, Object?> toJson() => _$LooseAddRequestToJson(this);
}
