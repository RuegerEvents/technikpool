// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'stocktake_confirm_group.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StocktakeConfirmGroup _$StocktakeConfirmGroupFromJson(
  Map<String, dynamic> json,
) => StocktakeConfirmGroup(
  kind: StocktakeConfirmGroupKind.fromJson(json['kind'] as String),
  name: json['name'] as String,
);

Map<String, dynamic> _$StocktakeConfirmGroupToJson(
  StocktakeConfirmGroup instance,
) => <String, dynamic>{'kind': instance.kind, 'name': instance.name};
