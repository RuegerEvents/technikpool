// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'stocktake_progress.g.dart';

@JsonSerializable()
class StocktakeProgress {
  const StocktakeProgress({
    required this.expected,
    required this.found,
    required this.out,
    required this.unexpected,
  });
  
  factory StocktakeProgress.fromJson(Map<String, Object?> json) => _$StocktakeProgressFromJson(json);
  
  /// Units to find, loose ones included. Excludes units checked out right now.
  final int expected;

  /// Of `expected`, how many were counted. A surplus of one loose product does not make up for a shortfall of another.
  final int found;

  /// Checked out on a production and not scanned.
  final int out;

  /// Scanned although not on the list.
  final int unexpected;

  Map<String, Object?> toJson() => _$StocktakeProgressToJson(this);
}
