import '../api/generated/export.dart';
import '../l10n/generated/app_localizations.dart';

/// How a swap of linked units reads in a scan result: the scanned unit took
/// the place of another of the same product, and where that one went. See
/// `ScanSwap` in apps/web/openapi.yaml.
String swapNotice(S l10n, ScanSwap swap) {
  final moved = switch (swap.partnerTo) {
    final place? => l10n.swapPartnerMoved(swap.partnerLabel, place),
    null => l10n.swapPartnerLoose(swap.partnerLabel),
  };
  return '${l10n.swapIn(swap.partnerLabel, swap.joined)} · $moved';
}
