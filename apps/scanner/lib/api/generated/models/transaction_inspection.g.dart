// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'transaction_inspection.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TransactionInspection _$TransactionInspectionFromJson(
  Map<String, dynamic> json,
) => TransactionInspection(
  performedAt: DateTime.parse(json['performedAt'] as String),
  result: InspectionResult.fromJson(json['result'] as String),
  inspectorName: json['inspectorName'] as String?,
  markedBroken: json['markedBroken'] as bool?,
);

Map<String, dynamic> _$TransactionInspectionToJson(
  TransactionInspection instance,
) => <String, dynamic>{
  'performedAt': instance.performedAt.toIso8601String(),
  'result': instance.result,
  'inspectorName': ?instance.inspectorName,
  'markedBroken': ?instance.markedBroken,
};
