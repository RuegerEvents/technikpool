// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/asset.dart';
import '../models/asset_create_request.dart';
import '../models/asset_detail.dart';
import '../models/asset_page.dart';
import '../models/asset_tag_request.dart';
import '../models/category.dart';
import '../models/location.dart';
import '../models/production.dart';

part 'inventory_client.g.dart';

@RestApi()
abstract class InventoryClient {
  factory InventoryClient(Dio dio, {String? baseUrl}) = _InventoryClient;

  /// Locations across the user's organizations
  @GET('/api/v1/locations')
  Future<List<Location>> listLocations();

  /// Productions across the user's organizations.
  ///
  /// Cancelled productions are left out: nothing can be checked out to one,.
  /// so it is never a scan target. Units still out on a cancelled production.
  /// come back by scanning them onto a location, as always.
  @GET('/api/v1/productions')
  Future<List<Production>> listProductions();

  /// Product categories.
  ///
  /// Global rather than per-organization: a category is a kind of equipment,.
  /// and two orgs lending each other a moving light agree on what it is.
  @GET('/api/v1/categories')
  Future<List<Category>> listCategories();

  /// Browse assets.
  ///
  /// Sold and decommissioned assets are left out — this is the pool that can.
  /// still be worked with. Look one up by tag to see a retired unit.
  ///
  /// [locationId] - Only assets currently at this location.
  ///
  /// [productionId] - Only assets booked to this production. Listing a production's kit is a read of that production, so a caller who may not open it is refused (`403`) rather than handed an empty page, and an id that names nothing answers `404 production_not_found`.
  ///
  /// [categoryId] - Only assets whose product is in this category.
  ///
  /// [productId] - Only units of this product.
  ///
  /// [q] - Case-insensitive match on asset tag, serial number, product or manufacturer name.
  ///
  /// [cursor] - The `nextCursor` from a previous page.
  @GET('/api/v1/assets')
  Future<AssetPage> listAssets({
    @Query('limit') int? limit = 50,
    @Query('locationId') String? locationId,
    @Query('productionId') String? productionId,
    @Query('categoryId') String? categoryId,
    @Query('productId') String? productId,
    @Query('q') String? q,
    @Query('cursor') String? cursor,
  });

  /// Register one unit of a product, with the tag just scanned.
  ///
  /// Takes ADMIN of the organization, like registering units on the web.
  /// The tag is required and is used as given — nothing is numbered for it:.
  /// it has to start with the org's prefix (`asset_tag_prefix_mismatch`).
  /// and not be on another unit already (`asset_tag_in_use`).
  @POST('/api/v1/assets')
  Future<Asset> createAsset({
    @Body() required AssetCreateRequest body,
  });

  /// Give an untagged unit the tag just scanned.
  ///
  /// Takes ADMIN of the unit's organization. Only for a unit without a tag:.
  /// one that has one is refused (`asset_already_tagged`) — a second scan on.
  /// the wrong row is likelier than a sticker that really changed, and the.
  /// web is where a tag is corrected. Same checks on the tag as.
  /// `createAsset`.
  @PUT('/api/v1/assets/{assetId}/tag')
  Future<Asset> setAssetTag({
    @Path('assetId') required String assetId,
    @Body() required AssetTagRequest body,
  });

  /// Look up one asset by its printed tag or serial number.
  ///
  /// The asset tag is unique and always wins. Failing that the code is.
  /// matched, case-insensitively, against serial numbers among the assets.
  /// the caller can already see — and only resolves when exactly one unit.
  /// carries it. Two units sharing a serial answer `409 serial_ambiguous`.
  /// rather than guessing between them.
  ///
  /// [tag] - The asset tag as encoded in the sticker's barcode, or a serial.
  /// number that belongs to exactly one unit.
  @GET('/api/v1/assets/by-tag/{tag}')
  Future<AssetDetail> getAssetByTag({
    @Path('tag') required String tag,
  });
}
