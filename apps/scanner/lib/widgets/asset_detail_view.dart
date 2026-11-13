import 'package:flutter/material.dart';

import '../api/generated/export.dart';
import '../cable_format.dart';
import '../inspection_due.dart';
import '../l10n/generated/app_localizations.dart';
import '../l10n/labels.dart';
import '../legal.dart';
import '../product_label.dart';
import '../theme.dart';
import 'category_pill.dart';

/// Everything known about one unit: what it is, where, its inspections and
/// its history. Shown by Lookup after a scan, and by the unit's own screen
/// when it is opened from a list. Read-only: nothing here changes the unit.
class AssetDetailView extends StatelessWidget {
  const AssetDetailView({super.key, required this.asset, required this.onCaseCheck});

  final AssetDetail asset;

  /// Opens the case check for the case this unit belongs to.
  final VoidCallback onCaseCheck;

  @override
  Widget build(BuildContext context) {
    final l10n = S.of(context);
    return ListView(
      // The other half of dismissing the keyboard: on iOS a list under a
      // search field is expected to push it away as soon as you drag.
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.all(16),
      children: [
        Text(
          withCaption(
            productLabel(asset.product.manufacturerName, asset.product.name),
            asset.product.caption,
          ),
          style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            CategoryPill(asset.product.category),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                asset.assetTag ?? '—',
                style: const TextStyle(fontFamily: 'monospace', fontSize: 16),
              ),
            ),
            // The unit's number within its org, for its whole life.
            if (asset.orgIndex case final index?)
              Text(
                '#$index',
                style: TextStyle(
                  fontFamily: 'monospace',
                  fontSize: 16,
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
              ),
          ],
        ),
        const SizedBox(height: 20),
        _row(context, l10n.status, Labels.assetStatus(l10n, asset.status)),
        _row(context, l10n.serialNumber, asset.serialNumber ?? '—'),
        _row(context, l10n.currentLocation, asset.location.name),
        // A cable's ends and length are the two things you actually want off a
        // label, and the product name can't be trusted to carry both.
        if (asset.product.cable case final cable?) ...[
          // A loom is a list rather than a pair of ends: what runs through it,
          // and how many of each.
          if (cable.ways.isNotEmpty)
            _row(context, l10n.ways, cableWays(cable))
          else
            _row(context, l10n.connectors, cableConnectors(cable)),
          if (cableLength(cable, l10n.localeName) case final length?)
            _row(context, l10n.cableLength, length),
        ],
        if (asset.currentProduction != null)
          _row(context, l10n.checkedOutTo, asset.currentProduction!.name),
        if (asset.kit case final kit?)
          _row(context, l10n.lookupKit, [kit.name, ?kit.tag].join(' · ')),
        // A kit member or an accessory belongs to a case that can be checked.
        // A unit that *has* accessories can be too, but the detail doesn't
        // say so; scanning it on the case-check screen opens it all the same.
        if ((asset.bundleId != null || asset.parentAssetId != null) &&
            asset.assetTag != null) ...[
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: onCaseCheck,
            icon: const Icon(Icons.inventory_2_outlined),
            label: Text(l10n.caseCheck),
          ),
        ],
        ..._inspection(context, l10n, asset),
        // The product's notes — what a label has no room for.
        if (asset.product.details case final details? when details.isNotEmpty) ...[
          const SizedBox(height: 12),
          Text(details),
        ],
        // The product's manuals and datasheets. Public addresses, so they open
        // in the device's own viewer without a session.
        if (asset.documents case final documents? when documents.isNotEmpty) ...[
          const SizedBox(height: 24),
          Text(l10n.documents, style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          for (final document in documents)
            ListTile(
              dense: true,
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.picture_as_pdf_outlined),
              title: Text(document.title),
              subtitle: Text(Labels.documentKind(l10n, document.kind)),
              trailing: const Icon(Icons.open_in_new, size: 18),
              onTap: () => openExternal(context, Uri.parse(document.url)),
            ),
        ],
        const SizedBox(height: 24),
        Text(l10n.history, style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
        const SizedBox(height: 8),
        for (final tx in asset.history) _historyTile(context, l10n, tx),
      ],
    );
  }

  /// One history entry. An inspection entry carries the inspection it is
  /// about, so it says what the result was and on which day, as the web does.
  Widget _historyTile(BuildContext context, S l10n, AssetTransaction tx) {
    final inspection = tx.inspection;
    final day = inspection == null
        ? null
        : formatInspectionDay(inspection.performedAt, l10n.localeName);
    final failed = inspection?.result == InspectionResult.failed;
    final title = switch ((tx.action, day)) {
      ('INSPECTED', String _) =>
        failed ? l10n.historyInspectionFailed : l10n.historyInspectionPassed,
      ('INSPECTION_DELETED', final String day) => l10n.historyInspectionDeleted(day),
      _ => Labels.transactionAction(l10n, tx.action),
    };
    final when = tx.createdAt.toLocal().toString().substring(0, 16);
    return ListTile(
      dense: true,
      contentPadding: EdgeInsets.zero,
      title: Text(title),
      subtitle: Text(
        [
          if (tx.action == 'INSPECTED' && day != null) ...[
            l10n.historyInspectedOn(day),
            ?inspection?.inspectorName,
            if (inspection?.markedBroken ?? false) l10n.inspectionMarkedBroken,
          ],
          when,
          ?tx.userName,
          ?tx.productionName,
        ].join(' · '),
      ),
    );
  }

  /// Where the unit stands with its DGUV inspection. A server older than
  /// inspections sends none of the three fields, and a unit with no interval
  /// and nothing on file is not tracked — both show nothing at all.
  List<Widget> _inspection(BuildContext context, S l10n, AssetDetail asset) {
    final interval = asset.inspectionIntervalMonths;
    final due = asset.nextInspectionDue;
    final inspections = asset.inspections ?? const <Inspection>[];
    if (interval == null && due == null && inspections.isEmpty) return const [];

    final scheme = Theme.of(context).colorScheme;
    final status = StatusColors.of(context);
    final locale = l10n.localeName;

    Widget? dueRow;
    if (due != null) {
      final urgency = inspectionUrgency(due);
      final color = switch (urgency) {
        InspectionUrgency.overdue || InspectionUrgency.dueToday => scheme.error,
        InspectionUrgency.soon => status.warning,
        InspectionUrgency.later => null,
      };
      final notes = [
        if (inspections.isEmpty) l10n.inspectionNeverInspected,
        if (urgency == InspectionUrgency.overdue) l10n.inspectionOverdue,
        if (urgency == InspectionUrgency.dueToday) l10n.inspectionDueToday,
      ];
      dueRow = _row(
        context,
        l10n.inspectionNextDueLabel,
        [formatInspectionDay(due, locale), ...notes].join(' · '),
        color: color,
      );
    }

    return [
      const SizedBox(height: 24),
      Text(
        l10n.inspectionHeading,
        style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
      ),
      const SizedBox(height: 8),
      _row(
        context,
        l10n.inspectionInterval,
        interval == null
            ? l10n.inspectionNotTracked
            : l10n.inspectionIntervalMonths(interval),
      ),
      ?dueRow,
      if (inspections.isNotEmpty) ...[
        const SizedBox(height: 8),
        Text(l10n.inspectionRecent, style: TextStyle(color: scheme.onSurfaceVariant)),
        for (final inspection in inspections.take(3))
          ListTile(
            dense: true,
            contentPadding: EdgeInsets.zero,
            leading: Icon(
              inspection.result == InspectionResult.failed
                  ? Icons.cancel_outlined
                  : Icons.check_circle_outline,
              color: inspection.result == InspectionResult.failed
                  ? scheme.error
                  : status.success,
            ),
            title: Text(
              [
                formatInspectionDay(inspection.performedAt, locale),
                inspection.result == InspectionResult.failed
                    ? l10n.inspectionFailed
                    : l10n.inspectionPassed,
              ].join(' · '),
            ),
            subtitle: inspection.inspectorName == null && inspection.notes == null
                ? null
                : Text([?inspection.inspectorName, ?inspection.notes].join(' · ')),
          ),
      ],
    ];
  }

  Widget _row(BuildContext context, String label, String value, {Color? color}) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 6),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 150,
          child: Text(
            label,
            style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant),
          ),
        ),
        Expanded(
          child: Text(
            value,
            style: TextStyle(fontWeight: FontWeight.w500, color: color),
          ),
        ),
      ],
    ),
  );
}
