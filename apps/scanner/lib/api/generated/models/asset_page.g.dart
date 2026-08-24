// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'asset_page.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AssetPage _$AssetPageFromJson(Map<String, dynamic> json) => AssetPage(
  items: (json['items'] as List<dynamic>)
      .map((e) => Asset.fromJson(e as Map<String, dynamic>))
      .toList(),
  nextCursor: json['nextCursor'] as String?,
);

Map<String, dynamic> _$AssetPageToJson(AssetPage instance) => <String, dynamic>{
  'items': instance.items,
  'nextCursor': ?instance.nextCursor,
};
