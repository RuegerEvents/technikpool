// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'loose_add_result.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

LooseAddResult _$LooseAddResultFromJson(Map<String, dynamic> json) =>
    LooseAddResult(
      count: (json['count'] as num).toInt(),
      bundle: BundleDetail.fromJson(json['bundle'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$LooseAddResultToJson(LooseAddResult instance) =>
    <String, dynamic>{'count': instance.count, 'bundle': instance.bundle};
