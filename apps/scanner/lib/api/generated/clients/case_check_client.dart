// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/case_check.dart';
import '../models/case_check_request.dart';
import '../models/case_check_result.dart';
import '../models/case_check_scan_request.dart';
import '../models/case_check_scan_result.dart';
import '../models/case_kind.dart';
import '../models/case_label.dart';
import '../models/case_label_size.dart';

part 'case_check_client.g.dart';

@RestApi()
abstract class CaseCheckClient {
  factory CaseCheckClient(Dio dio, {String? baseUrl}) = _CaseCheckClient;

  /// Open the case a scanned code belongs to.
  ///
  /// A bundle tag opens its kit. A unit's tag or unique serial number opens.
  /// the kit the unit is in; failing that, the unit it is an accessory of,.
  /// or the unit itself when it has accessories. `scannedAssetId` is the.
  /// unit the code was on, which the client counts as found. A unit that.
  /// is none of these answers `409 not_a_case`.
  @GET('/api/v1/case-checks/by-code/{code}')
  Future<CaseCheck> getCaseCheckByCode({
    @Path('code') required String code,
  });

  /// Record a finished case check.
  ///
  /// Judges the case as it is now against `foundAssetIds` — ids not in the.
  /// case are ignored — and writes the outcome into every unit's history.
  /// Needs MEMBER or above of the org that owns the case (`canRecord`).
  @POST('/api/v1/case-checks')
  Future<CaseCheckResult> recordCaseCheck({
    @Body() required CaseCheckRequest body,
  });

  /// A code scanned into a case that is not on its list.
  ///
  /// Ticking happens on the client; this is for a code it does not find.
  /// on the case's list. A unit of the same product and organization as.
  /// one the case still lacks — not in `foundAssetIds`, not out on another.
  /// job — takes that one's place: the two swap (see `ScanSwap`), the.
  /// answer is `swapped` with the case as it is now, and the client ticks.
  /// `assetId`. Only for whoever may record the check (`canRecord`), and.
  /// never for a product marked `notInterchangeable`. A unit already on the.
  /// list answers `found`; anything else `foreign`, with its name where the.
  /// caller may see it.
  @POST('/api/v1/case-checks/{kind}/{id}/scans')
  Future<CaseCheckScanResult> scanCaseCheck({
    @Path('kind') required CaseKind kind,
    @Path('id') required String id,
    @Body() required CaseCheckScanRequest body,
  });

  /// A case's label as ZPL, for a thermal label printer.
  ///
  /// The label for the outside of a case (Kistenetikett): the org's logo or.
  /// name, the case's name, a DataMatrix of its tag, and — on the large.
  /// label — what it holds, identical units as one line, continued on.
  /// further labels when it is long. Rendered for a.
  /// 203 dpi printer speaking ZPL (a Honeywell PC42E-T in ZSim mode). The.
  /// client sends `zpl` unchanged to the printer's raw port, usually 9100;.
  /// the server never talks to a printer.
  ///
  /// `large` is a 4×6″ shipping label, `small` an 80×55 mm one with no.
  /// contents list. A kit's code is its own tag, else the tag of its case.
  /// (the container unit in it, `BundleDetail.caseUnitId`); a case with.
  /// neither prints without a code. Anyone who.
  /// sees the equipment may print one.
  @GET('/api/v1/case-checks/{kind}/{id}/label')
  Future<CaseLabel> getCaseLabel({
    @Path('kind') required CaseKind kind,
    @Path('id') required String id,
    @Query('size') CaseLabelSize? size,
  });
}
