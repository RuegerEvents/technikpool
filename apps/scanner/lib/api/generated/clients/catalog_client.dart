// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/catalog_product_page.dart';
import '../models/category_update_request.dart';
import '../models/category_updated.dart';
import '../models/connector.dart';
import '../models/product_update_request.dart';
import '../models/product_updated.dart';

part 'catalog_client.g.dart';

@RestApi()
abstract class CatalogClient {
  factory CatalogClient(Dio dio, {String? baseUrl}) = _CatalogClient;

  /// Change a category.
  ///
  /// System admins only. Fields left out are left alone. Switching.
  /// `requiresInspection` moves the inspection interval of every unit whose.
  /// product follows its category (`requiresInspection: null` on the.
  /// product): units that now need inspecting get their organization's.
  /// default interval, units that no longer do lose theirs.
  @PATCH('/api/v1/categories/{categoryId}')
  Future<CategoryUpdated> updateCategory({
    @Path('categoryId') required String categoryId,
    @Body() required CategoryUpdateRequest body,
  });

  /// Connectors in the catalog.
  ///
  /// Every connector a cable end or a device panel can name, by the.
  /// spelling the catalog files it under. Use these names in a product's.
  /// `cable` and `ports`; a name is matched without case.
  @GET('/api/v1/connectors')
  Future<List<Connector>> listConnectors();

  /// Browse the product catalog.
  ///
  /// The whole catalog, since it is shared, ordered by name. The unit counts.
  /// are of the caller's organizations only (every organization for a.
  /// system admin), and so are the `tracked` and `overdue` filters.
  ///
  /// [q] - Case-insensitive match on product name, caption or manufacturer name.
  ///
  /// [inspectionRequired] - Only products whose units do (`true`) or do not (`false`) need DGUV inspections, after the category default.
  ///
  /// [mains] - Only products with (`true`) or without (`false`) a connector that carries mains voltage.
  ///
  /// [tracked] - Only products with (`true`) or without (`false`) active units that carry an inspection interval. `inspectionRequired=false&tracked=true` finds units still tracked although their product says they need not be.
  ///
  /// [overdue] - Only products with at least one active unit whose inspection is due today or earlier.
  ///
  /// [cursor] - The `nextCursor` from a previous page.
  @GET('/api/v1/products')
  Future<CatalogProductPage> listProducts({
    @Query('limit') int? limit = 50,
    @Query('q') String? q,
    @Query('categoryId') String? categoryId,
    @Query('inspectionRequired') bool? inspectionRequired,
    @Query('mains') bool? mains,
    @Query('tracked') bool? tracked,
    @Query('overdue') bool? overdue,
    @Query('cursor') String? cursor,
  });

  /// Change a product.
  ///
  /// Fields left out are left alone. `cable` and `ports` each replace the.
  /// whole list they describe. A `ports` line naming a connector the catalog.
  /// does not have is refused (`404 connector_not_found`) before anything is.
  /// written; a cable end may name a new one, which is created and marked as.
  /// carrying mains voltage when its family already is. The panel answers to.
  /// a looser rule than the rest — a first panel is open to any MEMBER, as on.
  /// the web — and is written after the other fields, so a refusal there.
  /// leaves those applied. Changing `requiresInspection`, the.
  /// category or `isLicense` can change whether the product's units need.
  /// DGUV inspections, and moves their intervals accordingly — across every.
  /// organization holding units of it, which is why the right to do so is.
  /// the identity rule described under the `catalog` tag. A name another.
  /// product of the same manufacturer already has is refused (`409`).
  @PATCH('/api/v1/products/{productId}')
  Future<ProductUpdated> updateProduct({
    @Path('productId') required String productId,
    @Body() required ProductUpdateRequest body,
  });
}
