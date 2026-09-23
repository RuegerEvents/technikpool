// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'stocktake_confirm_entry.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StocktakeConfirmEntry _$StocktakeConfirmEntryFromJson(
  Map<String, dynamic> json,
) => StocktakeConfirmEntry(
  assetId: json['assetId'] as String,
  assetTag: json['assetTag'] as String?,
  productName: json['productName'] as String,
  manufacturerName: json['manufacturerName'] as String?,
  foundByName: json['foundByName'] as String?,
);

Map<String, dynamic> _$StocktakeConfirmEntryToJson(
  StocktakeConfirmEntry instance,
) => <String, dynamic>{
  'assetId': instance.assetId,
  'assetTag': ?instance.assetTag,
  'productName': instance.productName,
  'manufacturerName': ?instance.manufacturerName,
  'foundByName': ?instance.foundByName,
};
