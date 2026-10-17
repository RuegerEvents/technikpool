// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'list_kit.g.dart';

/// The kit a unit on a list is in. A kit's units arrive one after another.
/// within their section, so a client starts a kit heading whenever it.
/// changes. An accessory carries its parent's kit.
///
@JsonSerializable()
class ListKit {
  const ListKit({
    required this.id,
    required this.name,
    required this.tag,
  });
  
  factory ListKit.fromJson(Map<String, Object?> json) => _$ListKitFromJson(json);
  
  final String id;

  /// The kit's name with its caption.
  final String name;
  final String? tag;

  Map<String, Object?> toJson() => _$ListKitToJson(this);
}
