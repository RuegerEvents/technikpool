// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'stocktake_bundle.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StocktakeBundle _$StocktakeBundleFromJson(Map<String, dynamic> json) =>
    StocktakeBundle(
      id: json['id'] as String,
      name: json['name'] as String,
      tag: json['tag'] as String?,
    );

Map<String, dynamic> _$StocktakeBundleToJson(StocktakeBundle instance) =>
    <String, dynamic>{
      'id': instance.id,
      'tag': ?instance.tag,
      'name': instance.name,
    };
