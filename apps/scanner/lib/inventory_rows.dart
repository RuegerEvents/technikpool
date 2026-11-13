import 'api/generated/export.dart';
import 'natural_sort.dart';
import 'product_label.dart';

/// How the Inventory tab groups what it lists — the web's Devices page reads
/// the same three ways.
enum InventoryGrouping {
  /// Kits as one row each, beside the products of the units in no kit.
  bundles,

  /// Every product with its count, kit members included.
  products,

  /// One row per unit.
  devices,
}

/// One product's units in one organization, as a row of the Inventory tab —
/// counted by the server (`listInventoryProducts`).
class ProductRow {
  const ProductRow(this.counts);

  final InventoryProduct counts;

  Product get product => counts.product;

  String get name => productLabel(product.manufacturerName, product.name);
}

/// A row of the bundle view: a kit, or a product's loose units.
sealed class InventoryRow {
  const InventoryRow();

  String get sortName;
}

class KitInventoryRow extends InventoryRow {
  const KitInventoryRow(this.kit);

  final BundleSummary kit;

  @override
  String get sortName => kit.name;
}

class ProductInventoryRow extends InventoryRow {
  const ProductInventoryRow(this.row);

  final ProductRow row;

  @override
  String get sortName => row.name;
}

/// The bundle view: [kits] and the products of the loose units ([loose],
/// asked for with `looseOnly`) in one list, by name.
List<InventoryRow> bundleViewRows(List<InventoryProduct> loose, List<BundleSummary> kits) =>
    [
      for (final kit in kits) KitInventoryRow(kit),
      for (final counts in loose) ProductInventoryRow(ProductRow(counts)),
    ]..sort((a, b) => naturalCompare(a.sortName, b.sortName));
