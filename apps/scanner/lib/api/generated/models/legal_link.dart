// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'legal_link_kind.dart';

part 'legal_link.g.dart';

@JsonSerializable()
class LegalLink {
  const LegalLink({
    required this.kind,
    required this.url,
  });
  
  factory LegalLink.fromJson(Map<String, Object?> json) => _$LegalLinkFromJson(json);
  
  /// What the page is; the client names it in its own language.
  final LegalLinkKind kind;
  final String url;

  Map<String, Object?> toJson() => _$LegalLinkToJson(this);
}
