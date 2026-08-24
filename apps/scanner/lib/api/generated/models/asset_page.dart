// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'asset.dart';

part 'asset_page.g.dart';

@JsonSerializable()
class AssetPage {
  const AssetPage({required this.items, required this.nextCursor});

  factory AssetPage.fromJson(Map<String, Object?> json) => _$AssetPageFromJson(json);

  final List<Asset> items;

  /// Pass as `cursor` for the next page. Null on the last page.
  final String? nextCursor;

  Map<String, Object?> toJson() => _$AssetPageToJson(this);
}
