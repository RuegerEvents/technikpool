// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

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
  @POST('/api/v1/scans')
  Future<ScanResult> createScan({@Body() required ScanRequest body});
}
