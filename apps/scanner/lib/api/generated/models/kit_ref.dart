// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'kit_ref.g.dart';

/// A kit, named for a heading or a link.
@JsonSerializable()
class KitRef {
  const KitRef({
    required this.id,
    required this.name,
    required this.tag,
  });
  
  factory KitRef.fromJson(Map<String, Object?> json) => _$KitRefFromJson(json);
  
  final String id;

  /// The kit's name with its caption.
  final String name;
  final String? tag;

  Map<String, Object?> toJson() => _$KitRefToJson(this);
}
