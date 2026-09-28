// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'production_check_side.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ProductionCheckSide _$ProductionCheckSideFromJson(Map<String, dynamic> json) =>
    ProductionCheckSide(
      organizationId: json['organizationId'] as String,
      organizationName: json['organizationName'] as String,
      own: json['own'] as bool,
    );

Map<String, dynamic> _$ProductionCheckSideToJson(
  ProductionCheckSide instance,
) => <String, dynamic>{
  'organizationId': instance.organizationId,
  'organizationName': instance.organizationName,
  'own': instance.own,
};
