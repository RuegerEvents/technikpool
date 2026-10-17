// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'inspection_deleted.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

InspectionDeleted _$InspectionDeletedFromJson(Map<String, dynamic> json) =>
    InspectionDeleted(
      assetId: json['assetId'] as String,
      nextInspectionDue: json['nextInspectionDue'] == null
          ? null
          : DateTime.parse(json['nextInspectionDue'] as String),
    );

Map<String, dynamic> _$InspectionDeletedToJson(InspectionDeleted instance) =>
    <String, dynamic>{
      'assetId': instance.assetId,
      'nextInspectionDue': ?instance.nextInspectionDue?.toIso8601String(),
    };
