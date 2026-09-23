// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'stocktake_scan_request.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StocktakeScanRequest _$StocktakeScanRequestFromJson(
  Map<String, dynamic> json,
) => StocktakeScanRequest(
  code: json['code'] as String,
  locationId: json['locationId'] as String,
);

Map<String, dynamic> _$StocktakeScanRequestToJson(
  StocktakeScanRequest instance,
) => <String, dynamic>{
  'code': instance.code,
  'locationId': instance.locationId,
};
