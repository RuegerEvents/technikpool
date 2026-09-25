// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'stocktake_count_request.g.dart';

@JsonSerializable()
class StocktakeCountRequest {
  const StocktakeCountRequest({
    required this.productId,
    required this.locationId,
    required this.count,
    this.previous,
  });
  
  factory StocktakeCountRequest.fromJson(Map<String, Object?> json) => _$StocktakeCountRequestFromJson(json);
  
  final String productId;
  final String locationId;
  final int count;

  /// The caller's count here that this one was made from — 0 when there.
  /// was none yet, which is the same thing. When present, the count is.
  /// saved only if the stored one still matches, and otherwise refused.
  /// with `stocktake_count_changed`, so one person counting on two.
  /// devices can't overwrite a number they never saw. Leave it out to.
  /// replace unconditionally.
  ///
  final int? previous;

  Map<String, Object?> toJson() => _$StocktakeCountRequestToJson(this);
}
