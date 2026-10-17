// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'inspection_result.dart';

part 'transaction_inspection.g.dart';

@JsonSerializable()
class TransactionInspection {
  const TransactionInspection({
    required this.performedAt,
    required this.result,
    this.inspectorName,
    this.markedBroken,
  });
  
  factory TransactionInspection.fromJson(Map<String, Object?> json) => _$TransactionInspectionFromJson(json);
  
  /// The day it took place, as midnight UTC.
  final DateTime performedAt;
  final InspectionResult result;
  final String? inspectorName;

  /// This inspection failed and set the unit to `BROKEN`.
  final bool? markedBroken;

  Map<String, Object?> toJson() => _$TransactionInspectionToJson(this);
}
