// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'transaction_kit_swap_role.dart';

part 'transaction_kit_swap.g.dart';

@JsonSerializable()
class TransactionKitSwap {
  const TransactionKitSwap({
    required this.role,
    required this.kitName,
    required this.otherKitId,
    required this.otherKitName,
  });
  
  factory TransactionKitSwap.fromJson(Map<String, Object?> json) => _$TransactionKitSwapFromJson(json);
  
  /// `took_over`: this unit's kit went out in `otherKit`'s place and.
  /// took its booking over. `released`: `otherKit` went out instead,.
  /// and this unit's kit stays home.
  ///
  final TransactionKitSwapRole role;

  /// This unit's kit, with its number, as it read then.
  final String kitName;
  final String otherKitId;
  final String otherKitName;

  Map<String, Object?> toJson() => _$TransactionKitSwapToJson(this);
}
