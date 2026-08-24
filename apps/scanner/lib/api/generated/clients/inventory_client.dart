// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/asset_detail.dart';
import '../models/asset_page.dart';
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

  /// Productions across the user's organizations
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
  /// [locationId] - Only assets currently at this location.
  ///
  /// [productionId] - Only assets booked to this production.
  ///
  /// [categoryId] - Only assets whose product is in this category.
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
    @Query('q') String? q,
    @Query('cursor') String? cursor,
  });

  /// Look up one asset by its printed tag.
  ///
  /// [tag] - The asset tag as encoded in the sticker's barcode.
  @GET('/api/v1/assets/by-tag/{tag}')
  Future<AssetDetail> getAssetByTag({
    @Path('tag') required String tag,
  });
}
