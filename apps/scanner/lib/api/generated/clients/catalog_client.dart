// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/catalog_log_entry.dart';
import '../models/catalog_product.dart';
import '../models/catalog_product_page.dart';
import '../models/category_update_request.dart';
import '../models/category_updated.dart';
import '../models/connector.dart';
import '../models/connector_create_request.dart';
import '../models/connector_update_request.dart';
import '../models/manufacturer.dart';
import '../models/manufacturer_create_request.dart';
import '../models/manufacturer_created.dart';
import '../models/manufacturer_merge_request.dart';
import '../models/manufacturer_merged.dart';
import '../models/manufacturer_update_request.dart';
import '../models/product.dart';
import '../models/product_create_request.dart';
import '../models/product_deleted.dart';
import '../models/product_merge_request.dart';
import '../models/product_merged.dart';
import '../models/product_update_request.dart';
import '../models/product_updated.dart';

part 'catalog_client.g.dart';

@RestApi()
abstract class CatalogClient {
  factory CatalogClient(Dio dio, {String? baseUrl}) = _CatalogClient;

  /// Change a category.
  ///
  /// System admins only. Fields left out are left alone. Switching an.
  /// inspection type (`inspections`, or `requiresInspection` for the.
  /// electrical one) moves the inspection interval of every unit whose.
  /// product follows its category for that type: units that now need it get.
  /// their organization's interval, units that no longer do lose theirs.
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

  /// Register a connector.
  ///
  /// Returns the connector of that name if the catalog has one (ignoring.
  /// case), else registers it, so a panel can name it. Its family is the.
  /// name's first word unless given, and it carries mains voltage when that.
  /// family already does. Needs ADMIN or OWNER of an organization, as on.
  /// the web.
  @POST('/api/v1/connectors')
  Future<Connector> createConnector({
    @Body() required ConnectorCreateRequest body,
  });

  /// Browse the product catalog.
  ///
  /// The whole catalog, since it is shared, ordered by name. The unit counts.
  /// are of the caller's organizations only (every organization for a.
  /// system admin), and so are the `tracked` and `overdue` filters.
  ///
  /// [q] - Case-insensitive match on product name, caption or manufacturer name.
  ///
  /// [inspectionRequired] - Only products whose units do (`true`) or do not (`false`) need the inspection type `inspectionTypeId`, after the category default.
  ///
  /// [inspectionTypeId] - The type `inspectionRequired` asks about. Absent - electrical.
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
    @Query('inspectionTypeId') String? inspectionTypeId,
    @Query('mains') bool? mains,
    @Query('tracked') bool? tracked,
    @Query('overdue') bool? overdue,
    @Query('cursor') String? cursor,
  });

  /// Add a product to the catalog.
  ///
  /// For registering units of something the catalog does not know yet. One.
  /// product per name and manufacturer, ignoring case and blanks — a name.
  /// that is taken is `409` with the existing product's name in the.
  /// message. The manufacturer is found by name or made. Takes ADMIN or.
  /// above of `organizationId`, the org the units are for; the product.
  /// itself is shared by every org, like all of the catalog, and answers.
  /// to its creator until someone holds units of it. Pictures and cable.
  /// ends are edited on the web.
  @POST('/api/v1/products')
  Future<Product> createProduct({
    @Body() required ProductCreateRequest body,
  });

  /// One product of the catalog
  @GET('/api/v1/products/{productId}')
  Future<CatalogProduct> getProduct({
    @Path('productId') required String productId,
  });

  /// Delete a product nobody holds units of.
  ///
  /// Only a product without units, retired ones included (`409` otherwise —.
  /// merge it into the right product instead). Without units it answers to.
  /// its creator or a system admin. Cannot be reverted.
  @DELETE('/api/v1/products/{productId}')
  Future<ProductDeleted> deleteProduct({
    @Path('productId') required String productId,
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
  /// leaves those applied. Changing `inspections` (or `requiresInspection`,.
  /// the electrical type), the category or `isLicense` can change which.
  /// inspections the product's units need, and moves their intervals accordingly — across every.
  /// organization holding units of it, which is why the right to do so is.
  /// the identity rule described under the `catalog` tag. A name another.
  /// product of the same manufacturer already has is refused (`409`).
  @PATCH('/api/v1/products/{productId}')
  Future<ProductUpdated> updateProduct({
    @Path('productId') required String productId,
    @Body() required ProductUpdateRequest body,
  });

  /// Merge a duplicate into this product.
  ///
  /// Every unit of `sourceProductId` — retired ones too — becomes a unit of.
  /// this product, and the source row is deleted. This product keeps its.
  /// name, manufacturer and category; it takes the source's picture, cable.
  /// and panel only where it has none of its own, and an organization's.
  /// price for the source moves over unless that organization priced this.
  /// one itself. The moved units follow this product's inspection.
  /// requirement. Offers and invoices already written keep naming the.
  /// source. Needs the identity right over the *source* product. Cannot be.
  /// reverted.
  ///
  /// [productId] - The product that remains.
  @POST('/api/v1/products/{productId}/merge')
  Future<ProductMerged> mergeProduct({
    @Path('productId') required String productId,
    @Body() required ProductMergeRequest body,
  });

  /// Manufacturers in the catalog
  @GET('/api/v1/manufacturers')
  Future<List<Manufacturer>> listManufacturers();

  /// Find or register a manufacturer.
  ///
  /// Returns the manufacturer of that name if the catalog has one (ignoring.
  /// case), else registers it. Open to anyone who works in an organization,.
  /// as on the web.
  @POST('/api/v1/manufacturers')
  Future<ManufacturerCreated> createManufacturer({
    @Body() required ManufacturerCreateRequest body,
  });

  /// Rename a manufacturer.
  ///
  /// System admins only. A name another manufacturer has is refused (`409`).
  @PATCH('/api/v1/manufacturers/{manufacturerId}')
  Future<Manufacturer> updateManufacturer({
    @Path('manufacturerId') required String manufacturerId,
    @Body() required ManufacturerUpdateRequest body,
  });

  /// Merge a duplicate manufacturer into this one.
  ///
  /// System admins only. Every product of `sourceManufacturerId` moves to.
  /// this manufacturer and the source is deleted. Refused (`409`) while both.
  /// have a product of the same name — merge those products first.
  ///
  /// [manufacturerId] - The manufacturer that remains.
  @POST('/api/v1/manufacturers/{manufacturerId}/merge')
  Future<ManufacturerMerged> mergeManufacturer({
    @Path('manufacturerId') required String manufacturerId,
    @Body() required ManufacturerMergeRequest body,
  });

  /// Say whether a connector carries mains voltage.
  ///
  /// System admins only. Products are not re-flagged by this; a product with.
  /// a mains connector that does not need inspecting shows up under.
  /// `listProducts?mains=true&inspectionRequired=false`.
  ///
  /// [connector] - The connector's name, URL-encoded, matched without case.
  @PATCH('/api/v1/connectors/{connector}')
  Future<Connector> updateConnector({
    @Path('connector') required String connector,
    @Body() required ConnectorUpdateRequest body,
  });

  /// The catalog log.
  ///
  /// Every change to a product, manufacturer or category, newest first.
  /// System admins only, since it spans every organization.
  ///
  /// [productId] - Only entries about this product (merges name the product that remained).
  @GET('/api/v1/catalog-log')
  Future<List<CatalogLogEntry>> listCatalogLog({
    @Query('limit') int? limit = 100,
    @Query('productId') String? productId,
  });

  /// Undo a product change.
  ///
  /// System admins only. Puts back what one `PRODUCT_UPDATED` entry changed,.
  /// field by field, and only where the product still holds the value that.
  /// entry wrote. The revert is logged as a new entry with `revertOf`, so it.
  /// can be undone the same way. Merges and deletions cannot be reverted.
  /// (`409`), nor an entry every field of which has been changed again since.
  @POST('/api/v1/catalog-log/{entryId}/revert')
  Future<ProductUpdated> revertCatalogChange({
    @Path('entryId') required String entryId,
  });
}
