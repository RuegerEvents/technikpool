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
      ownerOrgId: json['ownerOrgId'] as String?,
      lengthCm: (json['lengthCm'] as num?)?.toInt(),
      productImageUrl: json['productImageUrl'] as String?,
      kit: json['kit'] == null
          ? null
          : ListKit.fromJson(json['kit'] as Map<String, dynamic>),
      packCase: json['packCase'] == null
          ? null
          : PackCase.fromJson(json['packCase'] as Map<String, dynamic>),
      isPackCase: json['isPackCase'] as bool?,
    );

Map<String, dynamic> _$ProductionCheckItemToJson(
  ProductionCheckItem instance,
) => <String, dynamic>{
  'ownerOrgId': ?instance.ownerOrgId,
  'lengthCm': ?instance.lengthCm,
  'assetId': instance.assetId,
  'assetTag': ?instance.assetTag,
  'productName': instance.productName,
  'productCaption': ?instance.productCaption,
  'manufacturerName': ?instance.manufacturerName,
  'productImageUrl': ?instance.productImageUrl,
  'lentBy': ?instance.lentBy,
  'accessoryOf': ?instance.accessoryOf,
  'group': instance.group,
  'kit': ?instance.kit,
  'packCase': ?instance.packCase,
  'isPackCase': ?instance.isPackCase,
  'status': instance.status,
  'received': instance.received,
  'returnReported': instance.returnReported,
  'tick': ?instance.tick,
};
