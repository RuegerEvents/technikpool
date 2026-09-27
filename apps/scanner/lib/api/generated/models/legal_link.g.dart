// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'legal_link.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

LegalLink _$LegalLinkFromJson(Map<String, dynamic> json) => LegalLink(
  kind: LegalLinkKind.fromJson(json['kind'] as String),
  url: json['url'] as String,
);

Map<String, dynamic> _$LegalLinkToJson(LegalLink instance) => <String, dynamic>{
  'kind': instance.kind,
  'url': instance.url,
};
