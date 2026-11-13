// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'cable_color_scheme.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CableColorScheme _$CableColorSchemeFromJson(Map<String, dynamic> json) =>
    CableColorScheme(
      organizationId: json['organizationId'] as String,
      bands: (json['bands'] as List<dynamic>)
          .map((e) => CableColorBand.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$CableColorSchemeToJson(CableColorScheme instance) =>
    <String, dynamic>{
      'organizationId': instance.organizationId,
      'bands': instance.bands,
    };
