// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'bundle_detail.dart';

part 'loose_add_result.g.dart';

@JsonSerializable()
class LooseAddResult {
  const LooseAddResult({
    required this.count,
    required this.bundle,
  });
  
  factory LooseAddResult.fromJson(Map<String, Object?> json) => _$LooseAddResultFromJson(json);
  
  final int count;
  final BundleDetail bundle;

  Map<String, Object?> toJson() => _$LooseAddResultToJson(this);
}
