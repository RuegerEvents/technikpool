// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'production_handout_item.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ProductionHandoutItem _$ProductionHandoutItemFromJson(
  Map<String, dynamic> json,
) => ProductionHandoutItem(
  assetId: json['assetId'] as String,
  assetTag: json['assetTag'] as String?,
  productName: json['productName'] as String,
  productCaption: json['productCaption'] as String?,
  manufacturerName: json['manufacturerName'] as String?,
  lentBy: json['lentBy'] as String?,
  accessoryOf: json['accessoryOf'] as String?,
  group: ProductionCheckGroup.fromJson(json['group'] as Map<String, dynamic>),
  status: ProductionHandoutItemStatus.fromJson(json['status'] as String),
  done: json['done'] as bool,
  received: json['received'] as bool,
  returnReported: json['returnReported'] as bool,
);

Map<String, dynamic> _$ProductionHandoutItemToJson(
  ProductionHandoutItem instance,
) => <String, dynamic>{
  'assetId': instance.assetId,
  'assetTag': ?instance.assetTag,
  'productName': instance.productName,
  'productCaption': ?instance.productCaption,
  'manufacturerName': ?instance.manufacturerName,
  'lentBy': ?instance.lentBy,
  'accessoryOf': ?instance.accessoryOf,
  'group': instance.group,
  'status': instance.status,
  'done': instance.done,
  'received': instance.received,
  'returnReported': instance.returnReported,
};
