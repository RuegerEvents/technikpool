// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'product_port_input.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ProductPortInput _$ProductPortInputFromJson(Map<String, dynamic> json) =>
    ProductPortInput(
      connector: json['connector'] as String,
      count: (json['count'] as num).toInt(),
      label: json['label'] as String?,
      requirement: json['requirement'] == null
          ? null
          : PortRequirement.fromJson(json['requirement'] as String?),
    );

Map<String, dynamic> _$ProductPortInputToJson(ProductPortInput instance) =>
    <String, dynamic>{
      'connector': instance.connector,
      'count': instance.count,
      'label': ?instance.label,
      'requirement': ?instance.requirement,
    };
