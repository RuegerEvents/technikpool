// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'stocktake_confirm_entry.g.dart';

@JsonSerializable()
class StocktakeConfirmEntry {
  const StocktakeConfirmEntry({
    required this.assetId,
    required this.assetTag,
    required this.productName,
    required this.manufacturerName,
    required this.foundByName,
    this.productCaption,
  });
  
  factory StocktakeConfirmEntry.fromJson(Map<String, Object?> json) => _$StocktakeConfirmEntryFromJson(json);
  
  final String assetId;
  final String? assetTag;
  final String productName;
  final String? manufacturerName;

  /// The product's caption (see Product.caption), to be shown after the.
  /// product name. Not required, so an older client keeps compiling.
  ///
  final String? productCaption;

  /// Counted already, by this person. Null when still to confirm.
  final String? foundByName;

  Map<String, Object?> toJson() => _$StocktakeConfirmEntryToJson(this);
}
