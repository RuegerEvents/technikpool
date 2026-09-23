// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'organization.dart';
import 'stocktake_location.dart';
import 'stocktake_progress.dart';
import 'stocktake_status.dart';

part 'stocktake_summary.g.dart';

@JsonSerializable()
class StocktakeSummary {
  const StocktakeSummary({
    required this.id,
    required this.name,
    required this.status,
    required this.organization,
    required this.createdAt,
    required this.createdByName,
    required this.progress,
    required this.countingLocations,
    this.closedAt,
  });
  
  factory StocktakeSummary.fromJson(Map<String, Object?> json) => _$StocktakeSummaryFromJson(json);
  
  final String id;
  final String name;
  final StocktakeStatus status;
  final Organization organization;
  final DateTime createdAt;
  final String createdByName;
  final DateTime? closedAt;
  final StocktakeProgress progress;

  /// Where a counter can say they are counting: the scope's locations, or all of the organization's when the scope names none.
  final List<StocktakeLocation> countingLocations;

  Map<String, Object?> toJson() => _$StocktakeSummaryToJson(this);
}
