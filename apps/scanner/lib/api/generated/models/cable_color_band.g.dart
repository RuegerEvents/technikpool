// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'cable_color_band.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CableColorBand _$CableColorBandFromJson(Map<String, dynamic> json) =>
    CableColorBand(
      maxLengthCm: (json['maxLengthCm'] as num).toInt(),
      paletteKey: json['paletteKey'] as String?,
      customName: json['customName'] as String?,
      customHex: json['customHex'] as String?,
    );

Map<String, dynamic> _$CableColorBandToJson(CableColorBand instance) =>
    <String, dynamic>{
      'maxLengthCm': instance.maxLengthCm,
      'paletteKey': ?instance.paletteKey,
      'customName': ?instance.customName,
      'customHex': ?instance.customHex,
    };
