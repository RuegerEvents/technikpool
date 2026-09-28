// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'production_check_tick.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ProductionCheckTick _$ProductionCheckTickFromJson(Map<String, dynamic> json) =>
    ProductionCheckTick(
      userName: json['userName'] as String,
      mine: json['mine'] as bool,
      via: ProductionCheckTickVia.fromJson(json['via'] as String),
      at: DateTime.parse(json['at'] as String),
    );

Map<String, dynamic> _$ProductionCheckTickToJson(
  ProductionCheckTick instance,
) => <String, dynamic>{
  'userName': instance.userName,
  'mine': instance.mine,
  'via': instance.via,
  'at': instance.at.toIso8601String(),
};
