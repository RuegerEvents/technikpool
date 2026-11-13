// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'case_label.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CaseLabel _$CaseLabelFromJson(Map<String, dynamic> json) => CaseLabel(
  contentsShown: json['contentsShown'] as bool,
  hasCase: json['hasCase'] as bool,
  size: CaseLabelSize.fromJson(json['size'] as String),
  zpl: json['zpl'] as String,
  labelCount: (json['labelCount'] as num).toInt(),
  widthMm: json['widthMm'] as num,
  heightMm: json['heightMm'] as num,
  dpmm: (json['dpmm'] as num).toInt(),
  previewUrl: json['previewUrl'] as String,
  previews: (json['previews'] as List<dynamic>?)
      ?.map((e) => e as String)
      .toList(),
);

Map<String, dynamic> _$CaseLabelToJson(CaseLabel instance) => <String, dynamic>{
  'contentsShown': instance.contentsShown,
  'previews': ?instance.previews,
  'hasCase': instance.hasCase,
  'size': instance.size,
  'zpl': instance.zpl,
  'labelCount': instance.labelCount,
  'widthMm': instance.widthMm,
  'heightMm': instance.heightMm,
  'dpmm': instance.dpmm,
  'previewUrl': instance.previewUrl,
};
