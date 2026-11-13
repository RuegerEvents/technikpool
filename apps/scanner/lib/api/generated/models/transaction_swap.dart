// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'transaction_swap_via.dart';

part 'transaction_swap.g.dart';

@JsonSerializable()
class TransactionSwap {
  const TransactionSwap({
    required this.partnerAssetId,
    required this.partnerLabel,
    required this.now,
    required this.before,
    required this.via,
  });
  
  factory TransactionSwap.fromJson(Map<String, Object?> json) => _$TransactionSwapFromJson(json);
  
  final String partnerAssetId;

  /// The other unit's tag, else its number.
  final String partnerLabel;

  /// The kit or unit this one is in since, by name. Null is loose.
  final String? now;

  /// Where it was before. Null is loose.
  final String? before;
  final TransactionSwapVia via;

  Map<String, Object?> toJson() => _$TransactionSwapToJson(this);
}
