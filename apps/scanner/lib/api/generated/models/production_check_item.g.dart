// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'production_check_item.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ProductionCheckItem _$ProductionCheckItemFromJson(Map<String, dynamic> json) =>
    ProductionCheckItem(
      assetId: json['assetId'] as String,
      assetTag: json['assetTag'] as String?,
      productName: json['productName'] as String,
      productCaption: json['productCaption'] as String?,
      manufacturerName: json['manufacturerName'] as String?,
      lentBy: json['lentBy'] as String?,
      accessoryOf: json['accessoryOf'] as String?,
      group: ProductionCheckGroup.fromJson(
        json['group'] as Map<String, dynamic>,
      ),
      status: ProductionCheckItemStatus.fromJson(json['status'] as String),
      received: json['received'] as bool,
      returnReported: json['returnReported'] as bool,
      tick: json['tick'] == null
          ? null
          : ProductionCheckTick.fromJson(json['tick'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$ProductionCheckItemToJson(
  ProductionCheckItem instance,
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
  'received': instance.received,
  'returnReported': instance.returnReported,
  'tick': ?instance.tick,
};
