// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/inspection_deleted.dart';
import '../models/inspection_recorded.dart';
import '../models/inspection_request.dart';

part 'inspection_client.g.dart';

@RestApi()
abstract class InspectionClient {
  factory InspectionClient(Dio dio, {String? baseUrl}) = _InspectionClient;

  /// Record an inspection of a scanned unit.
  ///
  /// `code` is resolved like `getAssetByTag`: the printed tag wins, and a.
  /// serial number only when exactly one visible unit carries it. A sold.
  /// or decommissioned unit is not inspected (`409 asset_retired`).
  @POST('/api/v1/inspections')
  Future<InspectionRecorded> recordInspection({
    @Body() required InspectionRequest body,
  });

  /// Delete an inspection recorded by mistake.
  ///
  /// The unit's next due date is derived again from what is left. A.
  /// `BROKEN` status the inspection set stays.
  @DELETE('/api/v1/inspections/{inspectionId}')
  Future<InspectionDeleted> deleteInspection({
    @Path('inspectionId') required String inspectionId,
  });
}
