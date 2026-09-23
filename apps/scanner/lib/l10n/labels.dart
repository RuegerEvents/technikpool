import '../api/generated/export.dart';
import 'generated/app_localizations.dart';

/// Labels for the enum-ish values the API returns. Kept apart from the UI copy
/// because these name *server* vocabulary: the value travelling over the wire
/// stays `CHECKED_OUT` in every language, and only its display name moves.
class Labels {
  const Labels._();

  static String assetStatus(S l10n, AssetStatus status) => switch (status) {
    AssetStatus.available => l10n.statusAvailable,
    AssetStatus.unavailable => l10n.statusUnavailable,
    AssetStatus.maintenance => l10n.statusMaintenance,
    AssetStatus.broken => l10n.statusBroken,
    AssetStatus.sold => l10n.statusSold,
    AssetStatus.decommissioned => l10n.statusDecommissioned,
    _ => status.name,
  };

  /// AssetTransaction.action is free text on the server, so an unknown value
  /// falls through to the raw string rather than being hidden. An action we
  /// have no translation for is still worth showing.
  ///
  /// The cases below are every `type` in the web's `TransactionData` union
  /// (apps/web/src/lib/types/asset-transaction.ts). That union is the list to
  /// check against when one is added there — a missing case is not an error on
  /// either side, it just surfaces as a raw `ADDED_TO_PRODUCTION` in the
  /// history, which is how this drifted in the first place.
  static String transactionAction(S l10n, String action) => switch (action) {
    'CREATED' => l10n.actionCreated,
    'CHECKED_OUT' => l10n.actionCheckedOut,
    'RETURNED' => l10n.actionReturned,
    'LOCATION_ASSIGNED' => l10n.actionLocationAssigned,
    'UPDATED' => l10n.actionUpdated,
    'REQUESTED' => l10n.actionRequested,
    'ADDED_TO_PRODUCTION' => l10n.actionAddedToProduction,
    'APPROVED' => l10n.actionApproved,
    'DECLINED' => l10n.actionDeclined,
    'BOOKING_CANCELLED' => l10n.actionBookingCancelled,
    'ACCESSORY_ATTACHED' => l10n.actionAccessoryAttached,
    'ACCESSORY_DETACHED' => l10n.actionAccessoryDetached,
    'CREDENTIALS_SET' => l10n.actionCredentialsSet,
    'CREDENTIALS_REMOVED' => l10n.actionCredentialsRemoved,
    'CREDENTIALS_REVEALED' => l10n.actionCredentialsRevealed,
    'STOCKTAKE_COUNTED' => l10n.actionStocktakeCounted,
    // Not in that union today; kept because the server owns the vocabulary
    // and these cost nothing until it writes them.
    'DELETED' => l10n.actionDeleted,
    'INSPECTED' => l10n.actionInspected,
    _ => action,
  };

  static String scanAction(S l10n, ScanResultAction action) => switch (action) {
    ScanResultAction.locationAssigned => l10n.actionLocationAssigned,
    ScanResultAction.checkedOut => l10n.actionCheckedOut,
    _ => action.name,
  };

  /// Why a stocktake scan was not on the list. A plain string on the wire (see
  /// StocktakeItem.unexpectedReason), so an unknown one falls through as-is.
  static String unexpectedReason(S l10n, String? reason) => switch (reason) {
    'other_org' => l10n.reasonOtherOrg,
    'retired' => l10n.reasonRetired,
    'added_later' => l10n.reasonAddedLater,
    'other_location' => l10n.reasonOtherLocation,
    'out_of_scope' => l10n.reasonOutOfScope,
    null => l10n.stocktakeUnexpected,
    _ => reason,
  };
}
