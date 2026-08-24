import '../api/generated/export.dart';

/// German labels for the enum-ish values the API returns. Kept apart from the
/// static copy in [S] because these map server values rather than naming UI.
class Labels {
  const Labels._();

  static String assetStatus(AssetStatus status) => switch (status) {
    AssetStatus.available => 'Verfügbar',
    AssetStatus.maintenance => 'In Wartung',
    AssetStatus.broken => 'Defekt',
    _ => status.name,
  };

  /// AssetTransaction.action is free text on the server, so unknown values fall
  /// through to the raw string rather than being hidden.
  static String transactionAction(String action) => switch (action) {
    'CREATED' => 'Angelegt',
    'CHECKED_OUT' => 'Ausgebucht',
    'RETURNED' => 'Zurückgegeben',
    'LOCATION_ASSIGNED' => 'Eingelagert',
    'UPDATED' => 'Geändert',
    'DELETED' => 'Gelöscht',
    'INSPECTED' => 'Geprüft',
    _ => action,
  };

  static String scanAction(ScanResultAction action) => switch (action) {
    ScanResultAction.locationAssigned => 'Eingelagert',
    ScanResultAction.checkedOut => 'Ausgebucht',
    _ => action.name,
  };
}
