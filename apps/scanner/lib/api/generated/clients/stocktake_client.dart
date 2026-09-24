// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/stocktake_count_request.dart';
import '../models/stocktake_create_request.dart';
import '../models/stocktake_detail.dart';
import '../models/stocktake_note_request.dart';
import '../models/stocktake_preview.dart';
import '../models/stocktake_scan_request.dart';
import '../models/stocktake_scan_result.dart';
import '../models/stocktake_scope_request.dart';
import '../models/stocktake_status.dart';
import '../models/stocktake_summary.dart';
import '../models/stocktake_tick_request.dart';
import '../models/stocktake_tick_result.dart';

part 'stocktake_client.g.dart';

@RestApi()
abstract class StocktakeClient {
  factory StocktakeClient(Dio dio, {String? baseUrl}) = _StocktakeClient;

  /// Stocktakes of the caller's organizations.
  ///
  /// [status] - Only open or only closed ones. Both when omitted.
  @GET('/api/v1/stocktakes')
  Future<List<StocktakeSummary>> listStocktakes({
    @Query('status') StocktakeStatus? status,
  });

  /// Start a stocktake.
  ///
  /// Stores the scope; the list is resolved whenever it is read. Needs MEMBER of the organization.
  /// A scope that matches nothing is refused with `409 stocktake_empty`.
  @POST('/api/v1/stocktakes')
  Future<StocktakeSummary> createStocktake({
    @Body() required StocktakeCreateRequest body,
  });

  /// What a stocktake with this scope would contain.
  ///
  /// Nothing is stored. `overlaps` lists open stocktakes that already count.
  /// some of the same units — allowed, but worth a warning before starting.
  @POST('/api/v1/stocktakes/preview')
  Future<StocktakePreview> previewStocktake({
    @Body() required StocktakeScopeRequest body,
  });

  /// A stocktake with every unit and product count
  @GET('/api/v1/stocktakes/{stocktakeId}')
  Future<StocktakeDetail> getStocktake({
    @Path('stocktakeId') required String stocktakeId,
  });

  /// Count one scanned code.
  ///
  /// An asset tag — or a serial number that belongs to exactly one unit —.
  /// ticks that unit (`found`, or `unexpected` when it is not on the list).
  /// and returns its accessories in `confirm`, for the operator to confirm.
  /// or uncheck; confirming goes through `tickStocktakeItems` with.
  /// `via: parent`. A unit someone already counted answers `already` and.
  /// changes nothing.
  ///
  /// A bundle tag ticks nothing and answers `bundle` with the members in.
  /// `confirm` (`via: bundle` to tick them): opening the case is the point.
  /// of a stocktake.
  ///
  /// `confirm` entries with a `foundByName` were counted already and should.
  /// be shown as such rather than offered.
  @POST('/api/v1/stocktakes/{stocktakeId}/scans')
  Future<StocktakeScanResult> scanIntoStocktake({
    @Path('stocktakeId') required String stocktakeId,
    @Body() required StocktakeScanRequest body,
  });

  /// Tick units by hand, or confirm accessories / bundle members
  @POST('/api/v1/stocktakes/{stocktakeId}/ticks')
  Future<StocktakeTickResult> tickStocktakeItems({
    @Path('stocktakeId') required String stocktakeId,
    @Body() required StocktakeTickRequest body,
  });

  /// Take back one's own tick.
  ///
  /// Only whoever counted a unit can untick it (`403 stocktake_not_your_tick`).
  /// An unexpected unit leaves the list altogether.
  @DELETE('/api/v1/stocktakes/{stocktakeId}/items/{assetId}')
  Future<void> untickStocktakeItem({
    @Path('stocktakeId') required String stocktakeId,
    @Path('assetId') required String assetId,
  });

  /// Note on a unit one counted, and whether it needs attention
  @PUT('/api/v1/stocktakes/{stocktakeId}/items/{assetId}')
  Future<void> setStocktakeItemNote({
    @Path('stocktakeId') required String stocktakeId,
    @Path('assetId') required String assetId,
    @Body() required StocktakeNoteRequest body,
  });

  /// The caller's count of a loose product at a location.
  ///
  /// Counts are kept per counter and location and summed, so two people.
  /// counting in two rooms add up. Setting one replaces the caller's own.
  /// previous count there; zero is a count.
  @PUT('/api/v1/stocktakes/{stocktakeId}/counts')
  Future<void> setStocktakeCount({
    @Path('stocktakeId') required String stocktakeId,
    @Body() required StocktakeCountRequest body,
  });

  /// Close a stocktake.
  ///
  /// Final: units still open become missing, and each unit's history gets an.
  /// entry. Corrections (marking missing units unavailable, moving found.
  /// ones) are applied afterwards on the web report.
  @POST('/api/v1/stocktakes/{stocktakeId}/close')
  Future<StocktakeSummary> closeStocktake({
    @Path('stocktakeId') required String stocktakeId,
  });
}
