// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/asset.dart';
import '../models/asset_create_request.dart';
import '../models/asset_create_result.dart';
import '../models/asset_detail.dart';
import '../models/asset_page.dart';
import '../models/asset_tag_request.dart';
import '../models/cable_color_scheme.dart';
import '../models/category.dart';
import '../models/inventory_product.dart';
import '../models/location.dart';
import '../models/production.dart';
import '../models/untagged_assets_request.dart';

part 'inventory_client.g.dart';

@RestApi()
abstract class InventoryClient {
  factory InventoryClient(Dio dio, {String? baseUrl}) = _InventoryClient;

  /// The cable colour codes the user's equipment is marked with.
  ///
  /// One scheme per organization: the colour of tape that marks each cable.
  /// length. Every organization the user belongs to, plus every organization.
  /// that has a unit on one of their productions — a lent cable carries its.
  /// owner's colour. An organization without bands is left out.
  ///
  /// A unit's colour is the band of its owner's scheme with the smallest.
  /// `maxLengthCm` that is at least the product's `cable.lengthCm`; a longer.
  /// cable, or a product without a length, has none.
  @GET('/api/v1/cable-colors')
  Future<List<CableColorScheme>> listCableColors();

  /// Locations a unit can be put at.
  ///
  /// Every location of the user's organizations — any role, DEVICE_VIEWER included —.
  /// plus any other location already holding active units of those organizations.
  /// A unit may be scanned onto a location of another organization the user belongs.
  /// to (a friend storing the equipment); that organization does not see it.
  @GET('/api/v1/locations')
  Future<List<Location>> listLocations();

  /// Productions across the user's organizations.
  ///
  /// Cancelled productions are left out: nothing can be checked out to one,.
  /// so it is never a scan target. Units still out on a cancelled production.
  /// come back by scanning them onto a location, as always.
  ///
  /// Includes other orgs' productions that the caller's orgs lend units to.
  /// `checkoutRole` says what a scan to each may do, `canCheck` whether the.
  /// caller may check it.
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
  /// [q] - Case-insensitive match on asset tag, serial number, product name or caption, or manufacturer name.
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

  /// Register a number of units that carry no tag.
  ///
  /// For what nobody puts a sticker on — a drawer of cables. `count` units.
  /// of one product, without tags. With `bundleId` they go straight into.
  /// that kit, as on `createAsset`. ADMIN or above of the organization.
  @POST('/api/v1/assets/untagged')
  Future<AssetCreateResult> createUntaggedAssets({
    @Body() required UntaggedAssetsRequest body,
  });

  /// One unit by its id, with recent history.
  ///
  /// The same answer as `GET /assets/by-tag/{tag}`, for a unit picked from.
  /// a list — an untagged one has no tag to look it up by. Only units of.
  /// the caller's organizations (any for a system admin).
  @GET('/api/v1/assets/{assetId}')
  Future<AssetDetail> getAsset({
    @Path('assetId') required String assetId,
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

  /// What the caller's organizations hold, per product.
  ///
  /// One row per product and organization, with how many active units it.
  /// holds — counted on the server, so a list of every product the.
  /// warehouse has needs no walk through every unit. Only products with at.
  /// least one unit after the filters. `looseOnly` leaves out units in a.
  /// kit, for a list that shows the kits as rows of their own (the web's.
  /// Bundle View). `q` matches by the same rules as every search box.
  /// (product name, caption, manufacturer, cable ends). Sorted by product.
  /// name.
  @GET('/api/v1/inventory/products')
  Future<List<InventoryProduct>> listInventoryProducts({
    @Query('q') String? q,
    @Query('organizationId') String? organizationId,
    @Query('locationId') String? locationId,
    @Query('categoryId') String? categoryId,
    @Query('looseOnly') bool? looseOnly,
  });
}
