// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'case_check_result.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CaseCheckResult _$CaseCheckResultFromJson(Map<String, dynamic> json) =>
    CaseCheckResult(
      found: (json['found'] as num).toInt(),
      missing: (json['missing'] as num).toInt(),
      away: (json['away'] as num).toInt(),
    );

Map<String, dynamic> _$CaseCheckResultToJson(CaseCheckResult instance) =>
    <String, dynamic>{
      'found': instance.found,
      'missing': instance.missing,
      'away': instance.away,
    };
