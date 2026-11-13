// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'transaction_kit_swap.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TransactionKitSwap _$TransactionKitSwapFromJson(Map<String, dynamic> json) =>
    TransactionKitSwap(
      role: TransactionKitSwapRole.fromJson(json['role'] as String),
      kitName: json['kitName'] as String,
      otherKitId: json['otherKitId'] as String,
      otherKitName: json['otherKitName'] as String,
    );

Map<String, dynamic> _$TransactionKitSwapToJson(TransactionKitSwap instance) =>
    <String, dynamic>{
      'role': instance.role,
      'kitName': instance.kitName,
      'otherKitId': instance.otherKitId,
      'otherKitName': instance.otherKitName,
    };
