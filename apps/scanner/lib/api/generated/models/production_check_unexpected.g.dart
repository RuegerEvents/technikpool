// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'production_check_unexpected.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ProductionCheckUnexpected _$ProductionCheckUnexpectedFromJson(
  Map<String, dynamic> json,
) => ProductionCheckUnexpected(
  assetId: json['assetId'] as String,
  assetTag: json['assetTag'] as String?,
  productName: json['productName'] as String,
  userName: json['userName'] as String,
  mine: json['mine'] as bool,
);

Map<String, dynamic> _$ProductionCheckUnexpectedToJson(
  ProductionCheckUnexpected instance,
) => <String, dynamic>{
  'assetId': instance.assetId,
  'assetTag': ?instance.assetTag,
  'productName': instance.productName,
  'userName': instance.userName,
  'mine': instance.mine,
};
