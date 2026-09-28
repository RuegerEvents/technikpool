// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'production_check.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ProductionCheck _$ProductionCheckFromJson(Map<String, dynamic> json) =>
    ProductionCheck(
      id: json['id'] as String,
      status: ProductionCheckStatus.fromJson(json['status'] as String),
      productionId: json['productionId'] as String,
      productionName: json['productionName'] as String,
      side: ProductionCheckSide.fromJson(json['side'] as Map<String, dynamic>),
      createdAt: DateTime.parse(json['createdAt'] as String),
      createdBy: json['createdBy'] as String,
      closedAt: json['closedAt'] == null
          ? null
          : DateTime.parse(json['closedAt'] as String),
      closedBy: json['closedBy'] as String?,
      items: (json['items'] as List<dynamic>)
          .map((e) => ProductionCheckItem.fromJson(e as Map<String, dynamic>))
          .toList(),
      unexpected: (json['unexpected'] as List<dynamic>)
          .map(
            (e) =>
                ProductionCheckUnexpected.fromJson(e as Map<String, dynamic>),
          )
          .toList(),
      canConfirmReceipt: (json['canConfirmReceipt'] as num).toInt(),
      canReportReturn: (json['canReportReturn'] as num).toInt(),
    );

Map<String, dynamic> _$ProductionCheckToJson(ProductionCheck instance) =>
    <String, dynamic>{
      'id': instance.id,
      'status': instance.status,
      'productionId': instance.productionId,
      'productionName': instance.productionName,
      'side': instance.side,
      'createdAt': instance.createdAt.toIso8601String(),
      'createdBy': instance.createdBy,
      'closedAt': ?instance.closedAt?.toIso8601String(),
      'closedBy': ?instance.closedBy,
      'items': instance.items,
      'unexpected': instance.unexpected,
      'canConfirmReceipt': instance.canConfirmReceipt,
      'canReportReturn': instance.canReportReturn,
    };
