// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'bundle_summary.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BundleSummary _$BundleSummaryFromJson(Map<String, dynamic> json) =>
    BundleSummary(
      id: json['id'] as String,
      name: json['name'] as String,
      caption: json['caption'] as String?,
      tag: json['tag'] as String?,
      imageUrl: json['imageUrl'] as String?,
      categoryName: json['categoryName'] as String,
      organizationId: json['organizationId'] as String,
      location: json['location'] == null
          ? null
          : LocationRef.fromJson(json['location'] as Map<String, dynamic>),
      unitCount: (json['unitCount'] as num).toInt(),
    );

Map<String, dynamic> _$BundleSummaryToJson(BundleSummary instance) =>
    <String, dynamic>{
      'id': instance.id,
      'name': instance.name,
      'caption': ?instance.caption,
      'tag': ?instance.tag,
      'imageUrl': ?instance.imageUrl,
      'categoryName': instance.categoryName,
      'organizationId': instance.organizationId,
      'location': ?instance.location,
      'unitCount': instance.unitCount,
    };
