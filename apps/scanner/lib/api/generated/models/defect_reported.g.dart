// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'defect_reported.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DefectReported _$DefectReportedFromJson(Map<String, dynamic> json) =>
    DefectReported(
      asset: Asset.fromJson(json['asset'] as Map<String, dynamic>),
      statusChanged: json['statusChanged'] as bool,
    );

Map<String, dynamic> _$DefectReportedToJson(DefectReported instance) =>
    <String, dynamic>{
      'asset': instance.asset,
      'statusChanged': instance.statusChanged,
    };
