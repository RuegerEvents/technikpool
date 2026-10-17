import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/client.dart';
import '../api/generated/export.dart';
import '../cable_format.dart';
import '../l10n/labels.dart';
import '../l10n/generated/app_localizations.dart';
import '../legal.dart';
import '../product_label.dart';
import '../scan/camera_scan_screen.dart';
import '../scan/scan_tones.dart';
import '../demo/demo_data.dart';
import '../inspection_due.dart';
import '../state/providers.dart';
import '../theme.dart';
import '../widgets/category_pill.dart';
import 'case_check_screen.dart';

/// Scan a tag outside a session to see what the thing is and where it's been —
/// without booking it anywhere.
class LookupScreen extends ConsumerStatefulWidget {
  const LookupScreen({super.key});

  @override
  ConsumerState<LookupScreen> createState() => _LookupScreenState();
}

class _LookupScreenState extends ConsumerState<LookupScreen> {
  final _controller = TextEditingController();
  StreamSubscription<String>? _sub;
  AssetDetail? _asset;
  String? _error;
  bool _busy = false;

  /// While a case check opened from here is in front, its scans are its own.
  bool _caseCheckOpen = false;

  @override
  void initState() {
    super.initState();
    _sub = ref.read(scanBusProvider).codes.listen((tag) {
      // Every tab stays mounted inside the IndexedStack, so this hears scans
      // meant for a session too. Only react when it is the tab in front.
      if (!mounted || ref.read(activeTabProvider) != HomeTab.lookup) return;
      if (_caseCheckOpen) return;
      unawaited(_lookup(tag.trim()));
    });
  }

  @override
  void dispose() {
    _sub?.cancel();
    _controller.dispose();
    super.dispose();
  }

  Future<void> _lookup(String tag) async {
    if (tag.isEmpty || _busy) return;
    final api = ref.read(apiClientProvider);
    if (api == null) return;

    // A scan never touches the field, so it would otherwise go on showing
    // whatever was typed before it — beside the result for a different unit.
    // The box reads what was looked up, whichever way the code arrived.
    if (_controller.text != tag) {
      _controller.value = TextEditingValue(
        text: tag,
        selection: TextSelection.collapsed(offset: tag.length),
      );
    }

    final l10n = S.of(context);

    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final asset = await api.inventory.getAssetByTag(tag: tag);
      if (mounted) setState(() => _asset = asset);
    } catch (error) {
      // No unit carries the code — it may be a kit's own sticker, whose
      // contents the case check shows.
      if (unwrapError(error) case ApiException(code: 'asset_not_found')
          when await _isKit(api, tag)) {
        if (mounted) {
          setState(() => _asset = null);
          unawaited(_checkCase(tag));
        }
        return;
      }
      if (mounted) {
        // A hit is read off the screen anyway; only a miss makes a sound.
        ref.scanTone(ScanTone.error);
        setState(() {
          _asset = null;
          _error = describeError(l10n, error);
        });
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<bool> _isKit(ApiClient api, String code) async {
    try {
      final found = await api.caseCheck.getCaseCheckByCode(code: code);
      return found.kind == CaseKind.bundle && found.scannedAssetId == null;
    } catch (_) {
      return false;
    }
  }

  Future<void> _checkCase(String code) async {
    _caseCheckOpen = true;
    await Navigator.of(context).push<void>(
      MaterialPageRoute(builder: (_) => CaseCheckScreen(initialCode: code)),
    );
    _caseCheckOpen = false;
  }

  @override
  Widget build(BuildContext context) {
    final l10n = S.of(context);
    return Scaffold(
      // HomeScreen's Scaffold owns the keyboard inset for every tab.
      resizeToAvoidBottomInset: false,
      appBar: AppBar(
        title: Text(l10n.lookup),
        actions: [
          if (ref.watch(scanSettingsProvider).cameraEnabled)
            IconButton(
              tooltip: l10n.scanWithCamera,
              onPressed: () =>
                  CameraScanScreen.once(context, title: l10n.lookup),
              icon: const Icon(Icons.photo_camera_outlined),
            ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(12),
            child: TextField(
              controller: _controller,
              textInputAction: TextInputAction.search,
              decoration: InputDecoration(
                labelText: l10n.manualEntry,
                prefixIcon: Icon(Icons.qr_code_scanner),
                // In the demo there is no sticker to point at, so the tag to
                // type has to be on screen. Inventory lists the rest.
                helperText: ref.watch(isDemoProvider)
                    ? l10n.demoTagHint(DemoData.assets().first.assetTag!)
                    : null,
              ),
              onSubmitted: (v) => _lookup(v.trim()),
            ),
          ),
          if (_busy) const LinearProgressIndicator(),
          Expanded(child: _body()),
        ],
      ),
    );
  }

  Widget _body() {
    final l10n = S.of(context);
    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(_error!, textAlign: TextAlign.center),
        ),
      );
    }
    final asset = _asset;
    if (asset == null) {
      return Center(child: Text(l10n.lookupHint));
    }

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
        _row(l10n.status, Labels.assetStatus(l10n, asset.status)),
        _row(l10n.serialNumber, asset.serialNumber ?? '—'),
        _row(l10n.currentLocation, asset.location.name),
        // A cable's ends and length are the two things you actually want off a
        // label, and the product name can't be trusted to carry both.
        if (asset.product.cable case final cable?) ...[
          // A loom is a list rather than a pair of ends: what runs through it,
          // and how many of each.
          if (cable.ways.isNotEmpty)
            _row(l10n.ways, cableWays(cable))
          else
            _row(l10n.connectors, cableConnectors(cable)),
          if (cableLength(cable, l10n.localeName) case final length?)
            _row(l10n.cableLength, length),
        ],
        if (asset.currentProduction != null)
          _row(l10n.checkedOutTo, asset.currentProduction!.name),
        if (asset.kit case final kit?)
          _row(l10n.lookupKit, [kit.name, ?kit.tag].join(' · ')),
        // A kit member or an accessory belongs to a case that can be checked.
        // A unit that *has* accessories can be too, but the detail doesn't
        // say so; scanning it on the case-check screen opens it all the same.
        if ((asset.bundleId != null || asset.parentAssetId != null) &&
            asset.assetTag != null) ...[
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: () => _checkCase(asset.assetTag!),
            icon: const Icon(Icons.inventory_2_outlined),
            label: Text(l10n.caseCheck),
          ),
        ],
        ..._inspection(l10n, asset),
        // The product's notes — what a label has no room for.
        if (asset.product.details case final details?
            when details.isNotEmpty) ...[
          const SizedBox(height: 12),
          Text(details),
        ],
        // The product's manuals and datasheets. Public addresses, so they open
        // in the device's own viewer without a session.
        if (asset.documents case final documents?
            when documents.isNotEmpty) ...[
          const SizedBox(height: 24),
          Text(
            l10n.documents,
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
          ),
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
        Text(
          l10n.history,
          style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 8),
        for (final tx in asset.history) _historyTile(l10n, tx),
      ],
    );
  }

  /// One history entry. An inspection entry carries the inspection it is
  /// about, so it says what the result was and on which day, as the web does.
  Widget _historyTile(S l10n, AssetTransaction tx) {
    final inspection = tx.inspection;
    final day = inspection == null
        ? null
        : formatInspectionDay(inspection.performedAt, l10n.localeName);
    final failed = inspection?.result == InspectionResult.failed;
    final title = switch ((tx.action, day)) {
      ('INSPECTED', String _) =>
        failed ? l10n.historyInspectionFailed : l10n.historyInspectionPassed,
      ('INSPECTION_DELETED', final String day) => l10n.historyInspectionDeleted(
        day,
      ),
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
  List<Widget> _inspection(S l10n, AssetDetail asset) {
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
        l10n.inspectionInterval,
        interval == null
            ? l10n.inspectionNotTracked
            : l10n.inspectionIntervalMonths(interval),
      ),
      ?dueRow,
      if (inspections.isNotEmpty) ...[
        const SizedBox(height: 8),
        Text(
          l10n.inspectionRecent,
          style: TextStyle(color: scheme.onSurfaceVariant),
        ),
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
            subtitle:
                inspection.inspectorName == null && inspection.notes == null
                ? null
                : Text(
                    [?inspection.inspectorName, ?inspection.notes].join(' · '),
                  ),
          ),
      ],
    ];
  }

  Widget _row(String label, String value, {Color? color}) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 6),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 150,
          child: Text(
            label,
            style: TextStyle(
              color: Theme.of(context).colorScheme.onSurfaceVariant,
            ),
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
