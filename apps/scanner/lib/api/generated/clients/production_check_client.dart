// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/handover_result.dart';
import '../models/production_check.dart';
import '../models/production_check_close_result.dart';
import '../models/production_check_scan_request.dart';
import '../models/production_check_scan_result.dart';
import '../models/production_check_start_request.dart';
import '../models/production_check_tick_request.dart';
import '../models/production_check_tick_result.dart';
import '../models/production_list_line_count.dart';
import '../models/production_list_line_result.dart';

part 'production_check_client.g.dart';

@RestApi()
abstract class ProductionCheckClient {
  factory ProductionCheckClient(Dio dio, {String? baseUrl}) = _ProductionCheckClient;

  /// Start a check of a production, or join the open one.
  ///
  /// Without `organizationId` the caller checks as the production's own org.
  /// when they may, else as the first org of theirs that lends to it.
  @POST('/api/v1/productions/{productionId}/checks')
  Future<ProductionCheck> startProductionCheck({
    @Path('productionId') required String productionId,
    @Body() ProductionCheckStartRequest? body,
  });

  /// A check with its list and who ticked what
  @GET('/api/v1/production-checks/{checkId}')
  Future<ProductionCheck> getProductionCheck({
    @Path('checkId') required String checkId,
  });

  /// Tick one scanned code.
  ///
  /// An asset tag — or a serial number that belongs to exactly one unit —.
  /// ticks that unit (`ticked`), along with its accessories that carry no.
  /// tag of their own. A unit already ticked answers `already`; one that is.
  /// not on the list is recorded as `unexpected`.
  @POST('/api/v1/production-checks/{checkId}/scans')
  Future<ProductionCheckScanResult> scanIntoProductionCheck({
    @Path('checkId') required String checkId,
    @Body() required ProductionCheckScanRequest body,
  });

  /// Tick units by hand.
  ///
  /// Ids not on the list are ignored.
  @POST('/api/v1/production-checks/{checkId}/ticks')
  Future<ProductionCheckTickResult> tickProductionCheckItems({
    @Path('checkId') required String checkId,
    @Body() required ProductionCheckTickRequest body,
  });

  /// Take back one's own tick.
  ///
  /// Only whoever ticked a unit can untick it (`403 tick_not_yours`).
  @DELETE('/api/v1/production-checks/{checkId}/ticks/{assetId}')
  Future<void> untickProductionCheckItem({
    @Path('checkId') required String checkId,
    @Path('assetId') required String assetId,
  });

  /// Finish a check.
  ///
  /// Writes one `PRODUCTION_CHECKED` entry into the history of every unit on.
  /// the list, found or missing, and closes the check. The next check starts.
  /// with nothing ticked.
  @POST('/api/v1/production-checks/{checkId}/close')
  Future<ProductionCheckCloseResult> closeProductionCheck({
    @Path('checkId') required String checkId,
  });

  /// Confirm receiving the ticked lent units.
  ///
  /// For the ticked units other orgs lent that are checked out to the.
  /// production and not yet confirmed. Only the production's own org.
  /// (MEMBER or above) or its crew (`403 receipt_forbidden`).
  @POST('/api/v1/production-checks/{checkId}/receipt')
  Future<HandoverResult> confirmProductionCheckReceipt({
    @Path('checkId') required String checkId,
  });

  /// Report the ticked lent units as sent back.
  ///
  /// For ticked lent units whose receipt was confirmed. Tells the lender.
  /// they are on their way; the lender scanning them onto a location is.
  /// what returns them. Same rights as `receipt`.
  @POST('/api/v1/production-checks/{checkId}/return-report')
  Future<HandoverResult> reportProductionCheckReturn({
    @Path('checkId') required String checkId,
  });

  /// Set how many units of a counted line are ticked.
  ///
  /// For a line of `lines` — interchangeable units without a tag. Raising.
  /// the count ticks the next units as the caller's; lowering it takes back.
  /// only the caller's own ticks, never below the line's `floor`. A count.
  /// out of range is clamped, not refused.
  @PUT('/api/v1/production-checks/{checkId}/lines')
  Future<ProductionListLineResult> setProductionCheckLine({
    @Path('checkId') required String checkId,
    @Body() required ProductionListLineCount body,
  });
}
