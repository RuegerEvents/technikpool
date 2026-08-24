import '../api/generated/export.dart';
import 'generated/app_localizations.dart';

/// Labels for the enum-ish values the API returns. Kept apart from the UI copy
/// because these name *server* vocabulary: the value travelling over the wire
/// stays `CHECKED_OUT` in every language, and only its display name moves.
class Labels {
  const Labels._();

  static String assetStatus(S l10n, AssetStatus status) => switch (status) {
    AssetStatus.available => l10n.statusAvailable,
    AssetStatus.maintenance => l10n.statusMaintenance,
    AssetStatus.broken => l10n.statusBroken,
    _ => status.name,
  };

  /// AssetTransaction.action is free text on the server, so an unknown value
  /// falls through to the raw string rather than being hidden. An action we
  /// have no translation for is still worth showing.
  static String transactionAction(S l10n, String action) => switch (action) {
    'CREATED' => l10n.actionCreated,
    'CHECKED_OUT' => l10n.actionCheckedOut,
    'RETURNED' => l10n.actionReturned,
    'LOCATION_ASSIGNED' => l10n.actionLocationAssigned,
    'UPDATED' => l10n.actionUpdated,
    'DELETED' => l10n.actionDeleted,
    'INSPECTED' => l10n.actionInspected,
    _ => action,
  };

  static String scanAction(S l10n, ScanResultAction action) => switch (action) {
    ScanResultAction.locationAssigned => l10n.actionLocationAssigned,
    ScanResultAction.checkedOut => l10n.actionCheckedOut,
    _ => action.name,
  };
}
