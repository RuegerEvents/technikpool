// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'product_document.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ProductDocument _$ProductDocumentFromJson(Map<String, dynamic> json) =>
    ProductDocument(
      id: json['id'] as String,
      kind: ProductDocumentKind.fromJson(json['kind'] as String),
      title: json['title'] as String,
      url: json['url'] as String,
      sizeBytes: (json['sizeBytes'] as num).toInt(),
    );

Map<String, dynamic> _$ProductDocumentToJson(ProductDocument instance) =>
    <String, dynamic>{
      'id': instance.id,
      'kind': instance.kind,
      'title': instance.title,
      'url': instance.url,
      'sizeBytes': instance.sizeBytes,
    };
