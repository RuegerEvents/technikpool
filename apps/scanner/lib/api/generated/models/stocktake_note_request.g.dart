// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'stocktake_note_request.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StocktakeNoteRequest _$StocktakeNoteRequestFromJson(
  Map<String, dynamic> json,
) => StocktakeNoteRequest(
  needsAttention: json['needsAttention'] as bool,
  note: json['note'] as String?,
);

Map<String, dynamic> _$StocktakeNoteRequestToJson(
  StocktakeNoteRequest instance,
) => <String, dynamic>{
  'note': ?instance.note,
  'needsAttention': instance.needsAttention,
};
