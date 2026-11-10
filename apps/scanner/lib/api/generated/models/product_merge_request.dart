// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'product_merge_request.g.dart';

@JsonSerializable()
class ProductMergeRequest {
  const ProductMergeRequest({
    required this.sourceProductId,
  });
  
  factory ProductMergeRequest.fromJson(Map<String, Object?> json) => _$ProductMergeRequestFromJson(json);
  
  /// The duplicate. Its units move, then it is deleted.
  final String sourceProductId;

  Map<String, Object?> toJson() => _$ProductMergeRequestToJson(this);
}
