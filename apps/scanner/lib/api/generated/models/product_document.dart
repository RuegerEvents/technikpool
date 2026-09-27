// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'product_document_kind.dart';

part 'product_document.g.dart';

@JsonSerializable()
class ProductDocument {
  const ProductDocument({
    required this.id,
    required this.kind,
    required this.title,
    required this.url,
    required this.sizeBytes,
  });
  
  factory ProductDocument.fromJson(Map<String, Object?> json) => _$ProductDocumentFromJson(json);
  
  final String id;
  final ProductDocumentKind kind;
  final String title;

  /// Absolute address of the PDF. Public, like Product.imageUrl — it.
  /// opens without a session, so hand it straight to a viewer.
  ///
  final String url;
  final int sizeBytes;

  Map<String, Object?> toJson() => _$ProductDocumentToJson(this);
}
