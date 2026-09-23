// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'stocktake_detail.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StocktakeDetail _$StocktakeDetailFromJson(Map<String, dynamic> json) =>
    StocktakeDetail(
      id: json['id'] as String,
      name: json['name'] as String,
      status: StocktakeStatus.fromJson(json['status'] as String),
      organization: Organization.fromJson(
        json['organization'] as Map<String, dynamic>,
      ),
      createdAt: DateTime.parse(json['createdAt'] as String),
      createdByName: json['createdByName'] as String,
      progress: StocktakeProgress.fromJson(
        json['progress'] as Map<String, dynamic>,
      ),
      countingLocations: (json['countingLocations'] as List<dynamic>)
          .map((e) => StocktakeLocation.fromJson(e as Map<String, dynamic>))
          .toList(),
      items: (json['items'] as List<dynamic>)
          .map((e) => StocktakeItem.fromJson(e as Map<String, dynamic>))
          .toList(),
      products: (json['products'] as List<dynamic>)
          .map((e) => StocktakeProductCount.fromJson(e as Map<String, dynamic>))
          .toList(),
      closedAt: json['closedAt'] == null
          ? null
          : DateTime.parse(json['closedAt'] as String),
    );

Map<String, dynamic> _$StocktakeDetailToJson(StocktakeDetail instance) =>
    <String, dynamic>{
      'id': instance.id,
      'name': instance.name,
      'status': instance.status,
      'organization': instance.organization,
      'createdAt': instance.createdAt.toIso8601String(),
      'createdByName': instance.createdByName,
      'closedAt': ?instance.closedAt?.toIso8601String(),
      'progress': instance.progress,
      'countingLocations': instance.countingLocations,
      'items': instance.items,
      'products': instance.products,
    };
