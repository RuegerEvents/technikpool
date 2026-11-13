// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'transaction_swap.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TransactionSwap _$TransactionSwapFromJson(Map<String, dynamic> json) =>
    TransactionSwap(
      partnerAssetId: json['partnerAssetId'] as String,
      partnerLabel: json['partnerLabel'] as String,
      now: json['now'] as String?,
      before: json['before'] as String?,
      via: TransactionSwapVia.fromJson(json['via'] as String),
    );

Map<String, dynamic> _$TransactionSwapToJson(TransactionSwap instance) =>
    <String, dynamic>{
      'partnerAssetId': instance.partnerAssetId,
      'partnerLabel': instance.partnerLabel,
      'now': ?instance.now,
      'before': ?instance.before,
      'via': instance.via,
    };
