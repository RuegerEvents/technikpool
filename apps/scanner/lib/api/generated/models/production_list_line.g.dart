// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'production_list_line.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ProductionListLine _$ProductionListLineFromJson(Map<String, dynamic> json) =>
    ProductionListLine(
      key: json['key'] as String,
      productName: json['productName'] as String,
      productCaption: json['productCaption'] as String?,
      manufacturerName: json['manufacturerName'] as String?,
      lentBy: json['lentBy'] as String?,
      group: ProductionCheckGroup.fromJson(
        json['group'] as Map<String, dynamic>,
      ),
      assetIds: (json['assetIds'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      total: (json['total'] as num).toInt(),
      done: (json['done'] as num).toInt(),
      floor: (json['floor'] as num).toInt(),
    );

Map<String, dynamic> _$ProductionListLineToJson(ProductionListLine instance) =>
    <String, dynamic>{
      'key': instance.key,
      'productName': instance.productName,
      'productCaption': ?instance.productCaption,
      'manufacturerName': ?instance.manufacturerName,
      'lentBy': ?instance.lentBy,
      'group': instance.group,
      'assetIds': instance.assetIds,
      'total': instance.total,
      'done': instance.done,
      'floor': instance.floor,
    };
