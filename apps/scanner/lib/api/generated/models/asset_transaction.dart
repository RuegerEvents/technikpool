// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'asset_transaction.g.dart';

@JsonSerializable()
class AssetTransaction {
  const AssetTransaction({
    required this.id,
    required this.action,
    required this.createdAt,
    this.userName,
    this.productionName,
  });
  
  factory AssetTransaction.fromJson(Map<String, Object?> json) => _$AssetTransactionFromJson(json);
  
  final String id;
  final String action;
  final DateTime createdAt;

  /// Who performed it. Null if the account has since been removed.
  final String? userName;
  final String? productionName;

  Map<String, Object?> toJson() => _$AssetTransactionToJson(this);
}
