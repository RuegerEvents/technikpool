// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'handout_scan_request.g.dart';

@JsonSerializable()
class HandoutScanRequest {
  const HandoutScanRequest({
    required this.code,
    this.packInto,
  });
  
  factory HandoutScanRequest.fromJson(Map<String, Object?> json) => _$HandoutScanRequestFromJson(json);
  
  final String code;

  /// `checkout` only: the case open on the device (its asset id). The.
  /// scanned unit — every unit of a kit's sticker — goes into it, and.
  /// out with it. A scanned case is never packed this way: it answers.
  /// `packCase`, and the client asks.
  ///
  final String? packInto;

  Map<String, Object?> toJson() => _$HandoutScanRequestToJson(this);
}
