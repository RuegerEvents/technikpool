// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'asset_create_result.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AssetCreateResult _$AssetCreateResultFromJson(Map<String, dynamic> json) =>
    AssetCreateResult(
      assets: (json['assets'] as List<dynamic>)
          .map((e) => Asset.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$AssetCreateResultToJson(AssetCreateResult instance) =>
    <String, dynamic>{'assets': instance.assets};
