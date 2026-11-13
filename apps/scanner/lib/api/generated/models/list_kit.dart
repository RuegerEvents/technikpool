// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'kit_ref.dart';

part 'list_kit.g.dart';

/// The kit a unit on a list is in. A kit's units arrive one after another.
/// within their section, so a client starts a kit heading whenever it.
/// changes. An accessory carries its parent's kit. A kit inside another.
/// kit is a kit of its own here, with `parent` set, and its units follow.
/// the outer kit's.
///
@JsonSerializable()
class ListKit {
  const ListKit({
    required this.id,
    required this.name,
    required this.tag,
    this.parent,
  });
  
  factory ListKit.fromJson(Map<String, Object?> json) => _$ListKitFromJson(json);
  
  final String id;

  /// The kit's name with its caption.
  final String name;
  final String? tag;

  /// The kit this one sits inside, if any.
  final KitRef? parent;

  Map<String, Object?> toJson() => _$ListKitToJson(this);
}
