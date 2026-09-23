// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'stocktake_create_request.g.dart';

@JsonSerializable()
class StocktakeCreateRequest {
  const StocktakeCreateRequest({
    required this.organizationId,
    this.locationIds,
    this.categoryIds,
    this.name,
  });
  
  factory StocktakeCreateRequest.fromJson(Map<String, Object?> json) => _$StocktakeCreateRequestFromJson(json);
  
  final String organizationId;

  /// Only units at these locations. All of the org's when empty or absent.
  final List<String>? locationIds;

  /// Only units whose product is in these categories. All when empty or absent.
  final List<String>? categoryIds;

  /// Defaults to the date and the scope's locations.
  final String? name;

  Map<String, Object?> toJson() => _$StocktakeCreateRequestToJson(this);
}
