// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'production_handout.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ProductionHandout _$ProductionHandoutFromJson(Map<String, dynamic> json) =>
    ProductionHandout(
      mode: HandoutMode.fromJson(json['mode'] as String),
      productionId: json['productionId'] as String,
      productionName: json['productionName'] as String,
      cancelled: json['cancelled'] as bool,
      side: ProductionCheckSide.fromJson(json['side'] as Map<String, dynamic>),
      sides: (json['sides'] as List<dynamic>)
          .map((e) => ProductionCheckSide.fromJson(e as Map<String, dynamic>))
          .toList(),
      items: (json['items'] as List<dynamic>)
          .map((e) => ProductionHandoutItem.fromJson(e as Map<String, dynamic>))
          .toList(),
      lines: (json['lines'] as List<dynamic>)
          .map((e) => ProductionListLine.fromJson(e as Map<String, dynamic>))
          .toList(),
      othersCount: (json['othersCount'] as num).toInt(),
    );

Map<String, dynamic> _$ProductionHandoutToJson(ProductionHandout instance) =>
    <String, dynamic>{
      'mode': instance.mode,
      'productionId': instance.productionId,
      'productionName': instance.productionName,
      'cancelled': instance.cancelled,
      'side': instance.side,
      'sides': instance.sides,
      'items': instance.items,
      'lines': instance.lines,
      'othersCount': instance.othersCount,
    };
