// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'stocktake_note_request.g.dart';

@JsonSerializable()
class StocktakeNoteRequest {
  const StocktakeNoteRequest({
    required this.needsAttention,
    this.note,
  });
  
  factory StocktakeNoteRequest.fromJson(Map<String, Object?> json) => _$StocktakeNoteRequestFromJson(json);
  
  final String? note;
  final bool needsAttention;

  Map<String, Object?> toJson() => _$StocktakeNoteRequestToJson(this);
}
