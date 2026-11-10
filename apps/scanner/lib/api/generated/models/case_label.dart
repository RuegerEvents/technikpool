// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'case_label_size.dart';

part 'case_label.g.dart';

@JsonSerializable()
class CaseLabel {
  const CaseLabel({
    required this.size,
    required this.zpl,
    required this.labelCount,
    required this.widthMm,
    required this.heightMm,
    required this.dpmm,
    required this.previewUrl,
  });
  
  factory CaseLabel.fromJson(Map<String, Object?> json) => _$CaseLabelFromJson(json);
  
  final CaseLabelSize size;

  /// One `^XA` … `^XZ` per label, UTF-8 (`^CI28`). A contents list too.
  /// long for one large label continues on the next; the title is only.
  /// on the first, the footer with the code only on the last.
  ///
  final String zpl;

  /// How many labels `zpl` prints — what a preview has to render.
  final int labelCount;

  /// Across the print head.
  final num widthMm;
  final num heightMm;

  /// Dots per millimetre the label was laid out for (8 = 203 dpi).
  final int dpmm;

  /// The same label in Labelary's online viewer. The ZPL is in the URL,.
  /// so opening it sends the label's text to labelary.com.
  ///
  final String previewUrl;

  Map<String, Object?> toJson() => _$CaseLabelToJson(this);
}
