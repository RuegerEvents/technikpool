// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'case_check_last.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CaseCheckLast _$CaseCheckLastFromJson(Map<String, dynamic> json) =>
    CaseCheckLast(
      at: DateTime.parse(json['at'] as String),
      userName: json['userName'] as String,
      found: (json['found'] as num).toInt(),
      expected: (json['expected'] as num).toInt(),
    );

Map<String, dynamic> _$CaseCheckLastToJson(CaseCheckLast instance) =>
    <String, dynamic>{
      'at': instance.at.toIso8601String(),
      'userName': instance.userName,
      'found': instance.found,
      'expected': instance.expected,
    };
