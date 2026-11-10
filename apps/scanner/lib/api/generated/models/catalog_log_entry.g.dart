// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'catalog_log_entry.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CatalogLogEntry _$CatalogLogEntryFromJson(Map<String, dynamic> json) =>
    CatalogLogEntry(
      id: json['id'] as String,
      action: json['action'] as String,
      createdAt: DateTime.parse(json['createdAt'] as String),
      userName: json['userName'] as String?,
      productId: json['productId'] as String?,
      manufacturerId: json['manufacturerId'] as String?,
      categoryId: json['categoryId'] as String?,
      data: json['data'],
      productName: json['productName'] as String?,
    );

Map<String, dynamic> _$CatalogLogEntryToJson(CatalogLogEntry instance) =>
    <String, dynamic>{
      'id': instance.id,
      'action': instance.action,
      'createdAt': instance.createdAt.toIso8601String(),
      'userName': ?instance.userName,
      'productId': ?instance.productId,
      'productName': ?instance.productName,
      'manufacturerId': ?instance.manufacturerId,
      'categoryId': ?instance.categoryId,
      'data': ?instance.data,
    };
