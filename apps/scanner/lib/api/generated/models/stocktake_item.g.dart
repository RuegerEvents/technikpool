// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'stocktake_item.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StocktakeItem _$StocktakeItemFromJson(Map<String, dynamic> json) =>
    StocktakeItem(
      assetId: json['assetId'] as String,
      assetTag: json['assetTag'] as String?,
      productName: json['productName'] as String,
      manufacturerName: json['manufacturerName'] as String?,
      category: Category.fromJson(json['category'] as Map<String, dynamic>),
      parentAssetId: json['parentAssetId'] as String?,
      state: StocktakeItemState.fromJson(json['state'] as String),
      expectedLocation: json['expectedLocation'] == null
          ? null
          : StocktakeLocation.fromJson(
              json['expectedLocation'] as Map<String, dynamic>,
            ),
      foundLocation: json['foundLocation'] == null
          ? null
          : StocktakeLocation.fromJson(
              json['foundLocation'] as Map<String, dynamic>,
            ),
      foundByName: json['foundByName'] as String?,
      foundByMe: json['foundByMe'] as bool,
      needsAttention: json['needsAttention'] as bool,
      serialNumber: json['serialNumber'] as String?,
      bundleName: json['bundleName'] as String?,
      outAt: json['outAt'] as String?,
      unexpectedReason: json['unexpectedReason'] as String?,
      note: json['note'] as String?,
    );

Map<String, dynamic> _$StocktakeItemToJson(StocktakeItem instance) =>
    <String, dynamic>{
      'assetId': instance.assetId,
      'assetTag': ?instance.assetTag,
      'serialNumber': ?instance.serialNumber,
      'productName': instance.productName,
      'manufacturerName': ?instance.manufacturerName,
      'category': instance.category,
      'parentAssetId': ?instance.parentAssetId,
      'bundleName': ?instance.bundleName,
      'state': instance.state,
      'expectedLocation': ?instance.expectedLocation,
      'foundLocation': ?instance.foundLocation,
      'outAt': ?instance.outAt,
      'unexpectedReason': ?instance.unexpectedReason,
      'foundByName': ?instance.foundByName,
      'foundByMe': instance.foundByMe,
      'note': ?instance.note,
      'needsAttention': instance.needsAttention,
    };
