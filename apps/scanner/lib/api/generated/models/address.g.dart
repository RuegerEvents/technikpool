// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'address.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

Address _$AddressFromJson(Map<String, dynamic> json) => Address(
  id: json['id'] as String,
  line1: json['line1'] as String,
  postalCode: json['postalCode'] as String,
  city: json['city'] as String,
  line2: json['line2'] as String?,
);

Map<String, dynamic> _$AddressToJson(Address instance) => <String, dynamic>{
  'id': instance.id,
  'line1': instance.line1,
  'line2': ?instance.line2,
  'postalCode': instance.postalCode,
  'city': instance.city,
};
