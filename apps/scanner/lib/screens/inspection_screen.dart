import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/client.dart';
import '../api/generated/export.dart';
import '../demo/demo_data.dart';
import '../inspection_due.dart';
import '../l10n/generated/app_localizations.dart';
import '../product_label.dart';
import '../scan/camera_scan_screen.dart';
import '../scan/scan_tones.dart';
import '../state/providers.dart';
import '../theme.dart';

/// Whether this account may record DGUV inspections anywhere: ADMIN or OWNER
/// of some organization, or a system admin. The server checks the unit's own
/// organization on every scan; this only decides whether the entry is offered.
bool canRecordInspections(CurrentUser? me) {
  if (me == null) return false;
  if (me.isAdmin) return true;
  return me.organizations.any(
    (o) =>
        o.role == MemberOrganizationRole.admin || o.role == MemberOrganizationRole.owner,
  );
}

/// One scan of the run: recorded, failed to record, or recorded and taken back.
class _Entry {
  _Entry.recorded(this.code, InspectionRecorded this.recorded) : error = null;
  _Entry.failed(this.code, String this.error) : recorded = null;

  final String code;
  final InspectionRecorded? recorded;
  final String? error;
  bool undone = false;
  bool undoing = false;
}

/// DGUV inspection (Prüfen (DGUV)): set the day, the inspector and a note
/// once, then scan unit after unit. Every scan records one inspection; the
/// next due date comes back from the server, which derives it — nobody sets it.
///
/// Passing is the norm, so the result toggle stands on "passed" and falls back
/// to it after a failed unit has been recorded: marking the next one failed is
/// a deliberate tap, never a leftover.
class InspectionScreen extends ConsumerStatefulWidget {
  const InspectionScreen({super.key});

  @override
  ConsumerState<InspectionScreen> createState() => _InspectionScreenState();
}

class _InspectionScreenState extends ConsumerState<InspectionScreen> {
  final _inspectorController = TextEditingController();
  final _notesController = TextEditingController();
  final _manualController = TextEditingController();
  final _feedback = StreamController<CameraScanFeedback>.broadcast();
  StreamSubscription<String>? _sub;

  /// One scan after another, as in the other scanning screens: a scan made
  /// while one is in flight, or while the "already inspected" dialog is open,
  /// waits its turn rather than vanishing.
  Future<void> _queue = Future<void>.value();
  bool _busy = false;

  bool _started = false;
  late DateTime _day = _today();
  InspectionResult _result = InspectionResult.passed;

  final _entries = <_Entry>[];

  /// Codes recorded in this run, lower-cased — the scanned code and the unit's
  /// tag and serial — so a unit scanned twice is asked about, not booked twice.
  final _seen = <String, _Entry>{};

  static DateTime _today() {
    final now = DateTime.now();
    return DateTime(now.year, now.month, now.day);
  }

  @override
  void initState() {
    super.initState();
    // Listens even while the camera is on top: the camera feeds the bus.
    _sub = ref.read(scanBusProvider).codes.listen(_enqueue);
    ref.read(inspectorNameProvider.future).then((name) {
      if (mounted && _inspectorController.text.isEmpty) {
        _inspectorController.text = name;
      }
    }, onError: (_) {});
  }

  @override
  void dispose() {
    _sub?.cancel();
    _inspectorController.dispose();
    _notesController.dispose();
    _manualController.dispose();
    _feedback.close();
    super.dispose();
  }

  void _enqueue(String code) {
    final trimmed = code.trim();
    // Before the run is set up there is no date or inspector to record with.
    if (trimmed.isEmpty || !_started) return;
    _queue = _queue.then((_) => _submit(trimmed));
  }

  void _submitManual() {
    // Not through the scan bus: a retyped tag is meant, and the bus would
    // swallow it as an echo.
    _enqueue(_manualController.text);
    _manualController.clear();
  }

  Future<void> _pickDay() async {
    final today = _today();
    final picked = await showDatePicker(
      context: context,
      initialDate: _day,
      firstDate: DateTime(today.year - 5),
      // An inspection is recorded after it happened, never ahead of it.
      lastDate: today,
    );
    if (picked != null && mounted) setState(() => _day = picked);
  }

  void _start() {
    ref.read(inspectorNameProvider.notifier).save(_inspectorController.text);
    FocusScope.of(context).unfocus();
    setState(() => _started = true);
  }

  Future<void> _submit(String code) async {
    if (!mounted || !_started) return;
    final api = ref.read(apiClientProvider);
    if (api == null) return;
    // Read before the first await — see SessionScreen._submit.
    final l10n = S.of(context);

    final previous = _seen[code.toLowerCase()];
    if (previous != null && !previous.undone) {
      ref.scanTone(ScanTone.already);
      if (!await _confirmAgain(l10n, previous) || !mounted) return;
    }

    final result = _result;
    final inspector = _inspectorController.text.trim();
    final notes = _notesController.text.trim();
    setState(() => _busy = true);
    try {
      final recorded = await api.inspection.recordInspection(
        body: InspectionRequest(
          code: code,
          performedAt: inspectionRequestDate(_day),
          result: result,
          inspectorName: inspector.isEmpty ? null : inspector,
          notes: notes.isEmpty ? null : notes,
        ),
      );
      final entry = _Entry.recorded(code, recorded);
      final asset = recorded.asset;
      for (final key in [code, ?asset.assetTag, ?asset.serialNumber]) {
        _seen[key.toLowerCase()] = entry;
      }
      _push(entry, l10n);
      if (mounted && result == InspectionResult.failed) {
        setState(() => _result = InspectionResult.passed);
      }
      if (mounted) {
        ref.scanTone(
          result == InspectionResult.failed ? ScanTone.attention : ScanTone.ok,
        );
      }
    } catch (error) {
      _push(_Entry.failed(code, _describe(l10n, error)), l10n);
      if (mounted) ref.scanTone(ScanTone.error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// The generic texts speak of booking; here the same refusals mean
  /// something more specific.
  String _describe(S l10n, Object error) => switch (unwrapError(error)) {
    ApiException(code: 'forbidden') => l10n.inspectionForbidden,
    ApiException(code: 'asset_retired') => l10n.inspectionRetired,
    _ => describeError(l10n, error),
  };

  Future<bool> _confirmAgain(S l10n, _Entry previous) async {
    final again = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(l10n.inspectionAlreadyTitle),
        content: Text(
          l10n.inspectionAlreadyBody(_title(previous), _resultLabel(l10n, previous)),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: Text(l10n.cancel),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: Text(l10n.inspectionRecordAgain),
          ),
        ],
      ),
    );
    return again ?? false;
  }

  Future<void> _undo(_Entry entry) async {
    final recorded = entry.recorded;
    final api = ref.read(apiClientProvider);
    if (recorded == null || entry.undone || entry.undoing || api == null) return;
    final l10n = S.of(context);
    final messenger = ScaffoldMessenger.of(context);

    void markUndone() {
      entry.undone = true;
      _seen.removeWhere((_, e) => identical(e, entry));
    }

    setState(() => entry.undoing = true);
    try {
      await api.inspection.deleteInspection(inspectionId: recorded.inspection.id);
      if (mounted) setState(markUndone);
      // Deleting never repairs the unit: someone has to decide that.
      if (recorded.markedBroken) {
        messenger.showSnackBar(SnackBar(content: Text(l10n.inspectionUndoneKeepsBroken)));
      }
    } catch (error) {
      if (unwrapError(error) case ApiException(code: 'not_found')) {
        if (mounted) setState(markUndone);
        messenger.showSnackBar(SnackBar(content: Text(l10n.inspectionAlreadyDeleted)));
      } else {
        messenger.showSnackBar(SnackBar(content: Text(describeError(l10n, error))));
      }
    } finally {
      if (mounted) setState(() => entry.undoing = false);
    }
  }

  void _push(_Entry entry, S l10n) {
    if (!_feedback.isClosed) {
      final recorded = entry.recorded;
      _feedback.add(
        CameraScanFeedback(
          ok: recorded != null,
          title: _title(entry),
          detail: recorded == null
              ? '${entry.code} · ${entry.error}'
              : [
                  recorded.asset.assetTag ?? entry.code,
                  _resultLabel(l10n, entry),
                  if (recorded.markedBroken) l10n.inspectionMarkedBroken,
                ].join(' · '),
        ),
      );
    }
    if (!mounted) return;
    setState(() => _entries.insert(0, entry));
  }

  String _title(_Entry entry) {
    final asset = entry.recorded?.asset;
    if (asset == null) return entry.code;
    return withCaption(
      productLabel(asset.product.manufacturerName, asset.product.name),
      asset.product.caption,
    );
  }

  String _resultLabel(S l10n, _Entry entry) =>
      entry.recorded?.inspection.result == InspectionResult.failed
      ? l10n.inspectionFailed
      : l10n.inspectionPassed;

  Future<void> _openCamera() => Navigator.of(context).push<void>(
    MaterialPageRoute(
      builder: (_) => CameraScanScreen(
        title: S.of(context).inspection,
        continuous: true,
        feedback: _feedback.stream,
      ),
    ),
  );

  @override
  Widget build(BuildContext context) {
    final l10n = S.of(context);
    final camera = _started && ref.watch(scanSettingsProvider).cameraEnabled;
    final recorded = _entries.where((e) => e.recorded != null && !e.undone);
    final failed = recorded
        .where((e) => e.recorded!.inspection.result == InspectionResult.failed)
        .length;

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.inspection),
        actions: [
          if (camera)
            IconButton(
              tooltip: l10n.scanWithCamera,
              onPressed: _openCamera,
              icon: const Icon(Icons.photo_camera_outlined),
            ),
          if (_started)
            IconButton(
              tooltip: l10n.inspectionEditSetup,
              onPressed: () => setState(() => _started = false),
              icon: const Icon(Icons.edit_calendar_outlined),
            ),
        ],
        bottom: _entries.isEmpty
            ? null
            : PreferredSize(
                preferredSize: const Size.fromHeight(30),
                child: Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Text(l10n.inspectionTally(recorded.length - failed, failed)),
                ),
              ),
      ),
      body: _started ? _scanning(l10n) : _setup(l10n),
    );
  }

  Widget _setup(S l10n) {
    return ListView(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.all(16),
      children: [
        ListTile(
          contentPadding: EdgeInsets.zero,
          leading: const Icon(Icons.event_outlined),
          title: Text(l10n.inspectionDate),
          subtitle: Text(
            formatInspectionDay(_day, l10n.localeName),
            style: const TextStyle(fontWeight: FontWeight.w600),
          ),
          trailing: const Icon(Icons.chevron_right),
          onTap: _pickDay,
        ),
        const SizedBox(height: 8),
        TextField(
          controller: _inspectorController,
          textCapitalization: TextCapitalization.words,
          textInputAction: TextInputAction.next,
          decoration: InputDecoration(
            labelText: l10n.inspectionInspector,
            hintText: l10n.inspectionInspectorHint,
            prefixIcon: const Icon(Icons.badge_outlined),
          ),
        ),
        const SizedBox(height: 16),
        TextField(
          controller: _notesController,
          minLines: 1,
          maxLines: 3,
          decoration: InputDecoration(
            labelText: l10n.inspectionNotes,
            helperText: l10n.inspectionNotesHint,
            prefixIcon: const Icon(Icons.notes),
          ),
        ),
        const SizedBox(height: 24),
        FilledButton.icon(
          onPressed: _start,
          icon: const Icon(Icons.qr_code_scanner),
          label: Text(l10n.inspectionStart),
        ),
      ],
    );
  }

  Widget _scanning(S l10n) {
    final scheme = Theme.of(context).colorScheme;
    final failing = _result == InspectionResult.failed;
    final inspector = _inspectorController.text.trim();

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 4),
          child: TextField(
            controller: _manualController,
            textInputAction: TextInputAction.done,
            decoration: InputDecoration(
              labelText: l10n.manualEntry,
              prefixIcon: const Icon(Icons.qr_code_scanner),
              // The demo has no sticker to point at, so a tag is shown.
              helperText: ref.watch(isDemoProvider)
                  ? l10n.demoTagHint(DemoData.assets().first.assetTag!)
                  : null,
            ),
            onSubmitted: (_) => _submitManual(),
          ),
        ),
        InkWell(
          onTap: () => setState(() => _started = false),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 4),
            child: Row(
              children: [
                Icon(Icons.event_outlined, size: 18, color: scheme.onSurfaceVariant),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    [
                      formatInspectionDay(_day, l10n.localeName),
                      ?(inspector.isEmpty ? null : inspector),
                    ].join(' · '),
                    style: TextStyle(color: scheme.onSurfaceVariant),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 4, 12, 4),
          child: SizedBox(
            width: double.infinity,
            child: SegmentedButton<InspectionResult>(
              showSelectedIcon: false,
              segments: [
                ButtonSegment(
                  value: InspectionResult.passed,
                  icon: const Icon(Icons.check_circle_outline),
                  label: Text(l10n.inspectionPassed),
                ),
                ButtonSegment(
                  value: InspectionResult.failed,
                  icon: const Icon(Icons.cancel_outlined),
                  label: Text(l10n.inspectionFailed),
                ),
              ],
              style: failing
                  ? SegmentedButton.styleFrom(
                      selectedBackgroundColor: scheme.error,
                      selectedForegroundColor: scheme.onError,
                    )
                  : null,
              selected: {_result},
              onSelectionChanged: (s) => setState(() => _result = s.first),
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 4),
          child: Text(
            failing ? l10n.inspectionFailedHint : l10n.inspectionNextResult,
            style: TextStyle(
              fontSize: 12,
              color: failing ? scheme.error : scheme.onSurfaceVariant,
            ),
          ),
        ),
        // Inverts while a scan is in flight, as in a session — readable at
        // arm's length by someone looking at the unit, not the screen.
        Container(
          width: double.infinity,
          color: _busy ? scheme.inverseSurface : scheme.surfaceContainerHighest,
          padding: const EdgeInsets.symmetric(vertical: 12),
          child: Center(
            child: Text(
              _busy ? '…' : l10n.scanNow,
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w600,
                color: _busy ? scheme.onInverseSurface : scheme.onSurface,
              ),
            ),
          ),
        ),
        Expanded(
          child: _entries.isEmpty
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text(l10n.inspectionEmpty, textAlign: TextAlign.center),
                  ),
                )
              : ListView.separated(
                  keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                  itemCount: _entries.length,
                  separatorBuilder: (_, _) => const Divider(height: 1),
                  itemBuilder: (_, i) => _row(l10n, _entries[i]),
                ),
        ),
      ],
    );
  }

  Widget _row(S l10n, _Entry entry) {
    final scheme = Theme.of(context).colorScheme;
    final status = StatusColors.of(context);
    final recorded = entry.recorded;

    if (recorded == null) {
      return ListTile(
        leading: Icon(Icons.error, color: scheme.error, size: 30),
        title: Text(entry.code, style: const TextStyle(fontWeight: FontWeight.w600)),
        subtitle: Text(entry.error ?? ''),
      );
    }

    final failed = recorded.inspection.result == InspectionResult.failed;
    final due = recorded.nextInspectionDue;
    final muted = entry.undone;
    return ListTile(
      leading: Icon(
        muted
            ? Icons.undo
            : failed
            ? Icons.cancel
            : Icons.check_circle,
        color: muted
            ? scheme.onSurfaceVariant
            : failed
            ? scheme.error
            : status.success,
        size: 30,
      ),
      title: Text(
        _title(entry),
        style: TextStyle(
          fontWeight: FontWeight.w600,
          decoration: muted ? TextDecoration.lineThrough : null,
        ),
      ),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            [
              recorded.asset.assetTag ?? entry.code,
              _resultLabel(l10n, entry),
            ].join(' · '),
          ),
          if (muted)
            Text(l10n.inspectionUndone)
          else ...[
            Text(
              due == null
                  ? l10n.inspectionNotTracked
                  : l10n.inspectionNextDue(formatInspectionDay(due, l10n.localeName)),
            ),
            if (recorded.markedBroken)
              Text(
                l10n.inspectionMarkedBroken,
                style: TextStyle(color: scheme.error, fontWeight: FontWeight.w600),
              ),
          ],
        ],
      ),
      trailing: muted
          ? null
          : entry.undoing
          ? const SizedBox.square(
              dimension: 24,
              child: CircularProgressIndicator(strokeWidth: 2),
            )
          : IconButton(
              tooltip: l10n.inspectionUndo,
              onPressed: () => _undo(entry),
              icon: const Icon(Icons.undo),
            ),
    );
  }
}
