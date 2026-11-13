// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/scan_batch_request.dart';
import '../models/scan_batch_result.dart';
import '../models/scan_request.dart';
import '../models/scan_result.dart';

part 'scanning_client.g.dart';

@RestApi()
abstract class ScanningClient {
  factory ScanningClient(Dio dio, {String? baseUrl}) = _ScanningClient;

  /// Book a scanned asset to a location or production.
  ///
  /// Assigning an asset to a location also returns it from any production it.
  /// is currently checked out to — putting kit back on the shelf is what.
  /// "returned" means in practice.
  ///
  /// `assetTag` also accepts a serial number, on the same terms as.
  /// `getAssetByTag`: the printed tag wins, and a serial resolves only when.
  /// exactly one visible unit carries it.
  ///
  /// A kit's number checked out to a production where another kit of its.
  /// type is booked takes that kit's booking over (`kitSwap`). Refused with.
  /// `409 kit_started` when everything booked of the type has begun to go.
  /// out, and `409 kit_unavailable` when a unit of it is.
  /// out or booked elsewhere for overlapping days. `params` of the error.
  /// are the booked kit's and the scanned kit's names.
  @POST('/api/v1/scans')
  Future<ScanResult> createScan({
    @Body() required ScanRequest body,
  });

  /// Book several units to a location or production at once.
  ///
  /// What follows a scan's `group`: the units picked from it, booked to the.
  /// same target the scan went to. Each unit takes its accessories along, as.
  /// a scan does. A kit's own location only moves when all of it is in the.
  /// batch. A batch to a production holding a whole kit may take over the.
  /// booking of the booked kit of its type, as a scan of the kit's number.
  /// does (`kitSwaps`, and the same `409 kit_*` refusals).
  @POST('/api/v1/scans/batch')
  Future<ScanBatchResult> createScanBatch({
    @Body() required ScanBatchRequest body,
  });
}
