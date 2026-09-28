// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'production_check_group.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ProductionCheckGroup _$ProductionCheckGroupFromJson(
  Map<String, dynamic> json,
) => ProductionCheckGroup(
  kind: ProductionCheckGroupKind.fromJson(json['kind'] as String),
  name: json['name'] as String?,
);

Map<String, dynamic> _$ProductionCheckGroupToJson(
  ProductionCheckGroup instance,
) => <String, dynamic>{'kind': instance.kind, 'name': ?instance.name};
