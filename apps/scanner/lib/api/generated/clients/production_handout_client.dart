// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/count_result.dart';
import '../models/handout_addition.dart';
import '../models/handout_addition_request.dart';
import '../models/handout_mode.dart';
import '../models/handover_result.dart';
import '../models/production_check_scan_request.dart';
import '../models/production_handout.dart';
import '../models/production_handout_tick_request.dart';
import '../models/production_list_line_count.dart';
import '../models/production_list_line_result.dart';
import '../models/scan_result.dart';

part 'production_handout_client.g.dart';

@RestApi()
abstract class ProductionHandoutClient {
  factory ProductionHandoutClient(Dio dio, {String? baseUrl}) = _ProductionHandoutClient;

  /// The list to hand a production's equipment out or take it back.
  ///
  /// The same list a check works through, but a tick is the booking itself.
  /// `checkout`: what is booked (APPROVED) or out (CHECKED_OUT), done when.
  /// out. `checkin`: all of that and what is back (RETURNED), done when.
  /// back — a unit booked but never handed out is taken back too, which.
  /// books its checkout first. Lists.
  /// only the units of the caller's orgs (MEMBER or above) — lent units are.
  /// handed over by their lender and only counted in `othersCount`.
  ///
  /// [organizationId] - The side to see the list from — one of `sides`. A lending org's.
  /// side lists only its units, by location: what it has to pack.
  /// Without it, the production's own side when the caller stands on.
  /// it, else their first lending org.
  @GET('/api/v1/productions/{productionId}/handout/{mode}')
  Future<ProductionHandout> getProductionHandout({
    @Path('productionId') required String productionId,
    @Path('mode') required HandoutMode mode,
    @Query('organizationId') String? organizationId,
  });

  /// Book one scanned code.
  ///
  /// `checkout` books it out to the production, exactly like a scan with.
  /// the production as the target. `checkin` puts it back onto the location.
  /// it is kept on, which returns it from the production; one booked here.
  /// and never handed out is checked out first. A unit from elsewhere is.
  /// still put back — `returnedFrom` without this production says so.
  @POST('/api/v1/productions/{productionId}/handout/{mode}/scans')
  Future<ScanResult> scanIntoProductionHandout({
    @Path('productionId') required String productionId,
    @Path('mode') required HandoutMode mode,
    @Body() required ProductionCheckScanRequest body,
  });

  /// Tick or untick units by hand.
  ///
  /// `done: true` books them (out, or back onto their own location);.
  /// `done: false` undoes that (back to booked, or out again). Accessories.
  /// come along with the unit they hang off.
  @POST('/api/v1/productions/{productionId}/handout/{mode}/ticks')
  Future<HandoverResult> tickProductionHandout({
    @Path('productionId') required String productionId,
    @Path('mode') required HandoutMode mode,
    @Body() required ProductionHandoutTickRequest body,
  });

  /// Set how many units of a counted line are done.
  ///
  /// Books the difference: raising the count books the next units of the.
  /// line, lowering it undoes the last ones. Clamped to the line.
  @PUT('/api/v1/productions/{productionId}/handout/{mode}/lines')
  Future<ProductionListLineResult> setProductionHandoutLine({
    @Path('productionId') required String productionId,
    @Path('mode') required HandoutMode mode,
    @Body() required ProductionListLineCount body,
  });

  /// Find units the hand-out list does not have, by name.
  ///
  /// For what was never booked and has nothing to scan: a cable without a.
  /// tag. Units of the caller's side whose product matches `q` by the same.
  /// rules as every search box (words in any order, lengths written either.
  /// way, cable ends included), free for the production's dates, grouped by.
  /// product, shelf and owner. Empty when the caller may not add to the.
  /// production from that side, or `q` is shorter than two characters.
  ///
  /// [organizationId] - The side, as on the hand-out list.
  @GET('/api/v1/productions/{productionId}/handout/checkout/additions')
  Future<List<HandoutAddition>> searchProductionHandoutAdditions({
    @Path('productionId') required String productionId,
    @Query('q') required String q,
    @Query('organizationId') String? organizationId,
  });

  /// Hand out a number of one search result.
  ///
  /// Hands out up to `count` units of one group, untagged first. Someone.
  /// may have taken some meanwhile: `count` in the answer is how many went.
  @POST('/api/v1/productions/{productionId}/handout/checkout/additions')
  Future<CountResult> handOutProductionAdditions({
    @Path('productionId') required String productionId,
    @Body() required HandoutAdditionRequest body,
  });
}
