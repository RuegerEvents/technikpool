// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/bundle_create_request.dart';
import '../models/bundle_detail.dart';
import '../models/bundle_scan_request.dart';
import '../models/bundle_scan_result.dart';
import '../models/bundle_summary.dart';
import '../models/loose_add_request.dart';
import '../models/loose_add_result.dart';
import '../models/loose_group.dart';

part 'bundles_client.g.dart';

@RestApi()
abstract class BundlesClient {
  factory BundlesClient(Dio dio, {String? baseUrl}) = _BundlesClient;

  /// The kits of the caller's organizations.
  ///
  /// [q] - Matches the kit's name, caption and tag, or anything in it.
  @GET('/api/v1/bundles')
  Future<List<BundleSummary>> listBundles({
    @Query('organizationId') String? organizationId,
    @Query('q') String? q,
  });

  /// Make a new kit, and a bundle type for it.
  ///
  /// A new bundle type of this name with its one case, empty, to be filled.
  /// by scanning. ADMIN or above of the organization.
  @POST('/api/v1/bundles')
  Future<BundleDetail> createBundle({
    @Body() required BundleCreateRequest body,
  });

  /// One kit with everything in it
  @GET('/api/v1/bundles/{bundleId}')
  Future<BundleDetail> getBundle({
    @Path('bundleId') required String bundleId,
  });

  /// Put a scanned unit, or another kit, into the kit.
  ///
  /// A unit's tag or unique serial number puts the unit in; an accessory's.
  /// puts in the unit it hangs off. Another bundle's tag puts that bundle.
  /// inside this one (`scannedBundle` names it), one level deep: a bundle.
  /// that sits inside another, or one that holds bundles itself, cannot take.
  /// part, and neither can a bundle go inside itself — those answer 409. A.
  /// unit or bundle in another kit is moved only with `moveFromOtherBundle`.
  /// — without it the answer is `in_other_bundle`, naming that kit, so the.
  /// client can ask first. Answers 200 for every outcome; an error status.
  /// means it could not go in (retired, unavailable, no room in the bundle.
  /// type, the nesting rules).
  @POST('/api/v1/bundles/{bundleId}/scans')
  Future<BundleScanResult> scanIntoBundle({
    @Path('bundleId') required String bundleId,
    @Body() required BundleScanRequest body,
  });

  /// Take a unit out of the kit.
  ///
  /// Its accessories leave with it. The unit stays where it is.
  @DELETE('/api/v1/bundles/{bundleId}/units/{assetId}')
  Future<BundleDetail> removeFromBundle({
    @Path('bundleId') required String bundleId,
    @Path('assetId') required String assetId,
  });

  /// Take a kit out of the kit it sits in.
  ///
  /// The inner kit stays where it is, with everything in it.
  @DELETE('/api/v1/bundles/{bundleId}/bundles/{innerBundleId}')
  Future<BundleDetail> removeBundleFromBundle({
    @Path('bundleId') required String bundleId,
    @Path('innerBundleId') required String innerBundleId,
  });

  /// Find loose units for the kit by name.
  ///
  /// The kit's organization's units in no kit and not out, whose product.
  /// matches `q` (same rules as every search box), by product and shelf —.
  /// for cables without a tag, which a scan cannot put in.
  @GET('/api/v1/bundles/{bundleId}/loose')
  Future<List<LooseGroup>> searchLooseForBundle({
    @Path('bundleId') required String bundleId,
    @Query('q') required String q,
  });

  /// Put a number of one product's loose units into the kit.
  ///
  /// Untagged units first, then by unit number. `count` in the answer is how many went in.
  @POST('/api/v1/bundles/{bundleId}/loose')
  Future<LooseAddResult> addLooseToBundle({
    @Path('bundleId') required String bundleId,
    @Body() required LooseAddRequest body,
  });
}
