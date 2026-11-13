import 'api/client.dart';
import 'api/generated/export.dart';

/// Registers one new unit carrying [tag] — the sticker just scanned. Shared by
/// the product's units screen and the new-device screen, so a scan registers
/// a unit the same way from either. With [bundleId] it goes straight into
/// that kit.
Future<Asset> registerTaggedUnit(
  ApiClient api, {
  required String productId,
  required String organizationId,
  required String locationId,
  required String tag,
  String? bundleId,
}) => api.inventory.createAsset(
  body: AssetCreateRequest(
    productId: productId,
    organizationId: organizationId,
    locationId: locationId,
    assetTag: tag,
    bundleId: bundleId,
  ),
);
