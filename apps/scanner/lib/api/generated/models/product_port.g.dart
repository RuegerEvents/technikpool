// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'product_port.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ProductPort _$ProductPortFromJson(Map<String, dynamic> json) => ProductPort(
  connector: json['connector'] as String,
  count: (json['count'] as num).toInt(),
  label: json['label'] as String?,
  requirement: PortRequirement.fromJson(json['requirement'] as String?),
);

Map<String, dynamic> _$ProductPortToJson(ProductPort instance) =>
    <String, dynamic>{
      'connector': instance.connector,
      'count': instance.count,
      'label': ?instance.label,
      'requirement': ?instance.requirement,
    };
