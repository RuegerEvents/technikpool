// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'handout_addition_request.g.dart';

@JsonSerializable()
class HandoutAdditionRequest {
  const HandoutAdditionRequest({
    required this.productId,
    required this.ownerId,
    required this.locationId,
    required this.count,
    this.organizationId,
  });
  
  factory HandoutAdditionRequest.fromJson(Map<String, Object?> json) => _$HandoutAdditionRequestFromJson(json);
  
  /// The side, as on the hand-out list.
  final String? organizationId;
  final String productId;

  /// `organizationId` of the chosen group.
  final String ownerId;
  final String locationId;
  final int count;

  Map<String, Object?> toJson() => _$HandoutAdditionRequestToJson(this);
}
