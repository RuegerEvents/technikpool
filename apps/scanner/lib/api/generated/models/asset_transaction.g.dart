// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'asset_transaction.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AssetTransaction _$AssetTransactionFromJson(Map<String, dynamic> json) =>
    AssetTransaction(
      id: json['id'] as String,
      action: json['action'] as String,
      createdAt: DateTime.parse(json['createdAt'] as String),
      userName: json['userName'] as String?,
      productionName: json['productionName'] as String?,
    );

Map<String, dynamic> _$AssetTransactionToJson(AssetTransaction instance) =>
    <String, dynamic>{
      'id': instance.id,
      'action': instance.action,
      'createdAt': instance.createdAt.toIso8601String(),
      'userName': ?instance.userName,
      'productionName': ?instance.productionName,
    };
