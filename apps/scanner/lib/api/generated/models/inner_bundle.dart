// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'inner_bundle.g.dart';

/// A kit that sits inside another one.
@JsonSerializable()
class InnerBundle {
  const InnerBundle({
    required this.id,
    required this.name,
    required this.caption,
    required this.tag,
    required this.imageUrl,
    required this.unitCount,
  });
  
  factory InnerBundle.fromJson(Map<String, Object?> json) => _$InnerBundleFromJson(json);
  
  final String id;

  /// The bundle type's name.
  final String name;
  final String? caption;
  final String? tag;
  final String? imageUrl;

  /// Units in it, not counting accessories.
  final int unitCount;

  Map<String, Object?> toJson() => _$InnerBundleToJson(this);
}
