// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'production.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

Production _$ProductionFromJson(Map<String, dynamic> json) => Production(
  id: json['id'] as String,
  name: json['name'] as String,
  organization: Organization.fromJson(
    json['organization'] as Map<String, dynamic>,
  ),
  startDate: json['startDate'] == null
      ? null
      : DateTime.parse(json['startDate'] as String),
  endDate: json['endDate'] == null
      ? null
      : DateTime.parse(json['endDate'] as String),
);

Map<String, dynamic> _$ProductionToJson(Production instance) =>
    <String, dynamic>{
      'id': instance.id,
      'name': instance.name,
      'startDate': ?instance.startDate?.toIso8601String(),
      'endDate': ?instance.endDate?.toIso8601String(),
      'organization': instance.organization,
    };
