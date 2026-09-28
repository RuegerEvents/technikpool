// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/case_check.dart';
import '../models/case_check_request.dart';
import '../models/case_check_result.dart';

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
}
