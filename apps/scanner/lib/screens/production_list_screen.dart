import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/client.dart';
import '../api/generated/export.dart';
import '../l10n/generated/app_localizations.dart';
import '../l10n/labels.dart';
import '../natural_sort.dart';
import '../product_label.dart';
import '../scan/camera_scan_screen.dart';
import '../scan/scan_tones.dart';
import '../state/providers.dart';
import '../theme.dart';
import '../widgets/accessory_dialog.dart';
import '../widgets/count_dialog.dart';
import '../widgets/product_thumb.dart';

/// What working through a production's list does with a tick.
///
/// - [check] (Prüfen): notes that the unit is there. Nothing about it changes.
/// - [checkout] (Ausgabe): books it out to the production, at once.
/// - [checkin] (Rücknahme): puts it back on the shelf it is kept on, at once.
enum ProductionListMode { check, checkout, checkin }

/// A production's equipment as one list, worked through the same way whatever
/// a tick means: scan a tag, tick a unit whose label was checked by eye, or
/// count the interchangeable units that carry no tag (twenty cables are one
/// line with a number, not twenty rows). Sections follow the shelves, lent
/// units come by lender.
///
/// The list lives on the server, because several people work through one
/// production at once — so every scan is a round trip, and the list is
/// reloaded every few seconds to show the others' ticks. A check also holds
/// the borrower's handover steps for lent units. See
/// services/production-list.ts, production-check.ts and production-handout.ts
/// on the web.
class ProductionListScreen extends ConsumerStatefulWidget {
  const ProductionListScreen({
    super.key,
    required this.productionId,
    required this.productionName,
    required this.mode,
  });

  final String productionId;
  final String productionName;
  final ProductionListMode mode;

  @override
  ConsumerState<ProductionListScreen> createState() => _ProductionListScreenState();
}

enum _Tone { good, info, warn, bad }

/// One unit's row, whichever list it comes from.
class _Unit {
  const _Unit({
    required this.assetId,
    required this.assetTag,
    required this.productName,
    required this.productCaption,
    required this.productImageUrl,
    required this.accessoryOf,
    required this.group,
    required this.kit,
    required this.done,
    required this.locked,
    this.doneBy,
    this.note,
    this.noteWarn = false,
    this.optional = false,
  });

  final String assetId;
  final String? assetTag;
  final String productName;
  final String? productCaption;
  final String? productImageUrl;
  final String? accessoryOf;
  final ProductionCheckGroup group;

  /// The kit it is in, listed under the kit's heading.
  final ListKit? kit;
  final bool done;

  /// Ticked by someone else, who alone may take it back.
  final bool locked;
  final String? doneBy;
  final String? note;
  final bool noteWarn;

  /// On the list to be ticked if need be, but not owed: left out of the counts
  /// and of "tick all" — a unit already taken back, on the hand-out list.
  final bool optional;
}

/// Rows that stay together when the counted lines are slotted in by name.
class _Block {
  _Block(this.id, this.name, this.rows, [this.head]);

  /// The unit the next accessory would hang off.
  String? id;
  final String name;
  final List<_Row> rows;
  final _KitHead? head;
}

/// A kit's heading, over its units (and their accessories) that follow it.
class _KitHead {
  _KitHead(this.kit);

  final ListKit kit;
  final units = <_Unit>[];
}

/// What a scan leaves to ask about: the accessories of a unit, or a kit's units.
typedef _Scanned = ({String? unit, ScanKit? kit});

/// A row of a section: a unit, a counted line, or a kit's heading.
typedef _Row = ({_Unit? unit, ProductionListLine? line, _KitHead? kit});

class _Section {
  _Section(this.group);

  final ProductionCheckGroup group;
  final rows = <_Row>[];
}

class _ProductionListScreenState extends ConsumerState<ProductionListScreen> {
  final _manualController = TextEditingController();
  final _feedback = StreamController<CameraScanFeedback>.broadcast();
  StreamSubscription<String>? _sub;
  Timer? _poll;

  /// One scan after another, as in the other scanning screens.
  Future<void> _queue = Future<void>.value();
  bool _busy = false;

  /// Scans waiting in [_queue], the running one included. A run of quick
  /// scans reloads the list once, after the last of them, instead of after
  /// each — a reload is the whole list, and doing it per scan is what made
  /// fast scanning stutter.
  int _waiting = 0;
  bool _stale = false;

  /// Units booked by a scan since the list was last loaded, which the list in
  /// hand does not show as ticked yet.
  final _justBooked = <String>{};

  ProductionCheck? _check;
  ProductionHandout? _handout;

  /// The side a handout list is seen from: everything, or only what one
  /// lending org has to pack. Null is the server's default.
  String? _organizationId;
  Object? _loadError;
  ({_Tone tone, String title, String? detail})? _last;

  /// What the last scan belongs with that did not come along — the rest of a
  /// kit — offered under the feedback, so a scan never waits on a tap.
  ({String label, List<String> assetIds})? _offer;

  /// Counts entered with `+` but not sent yet, by line key: a shelf of cables
  /// is counted by pressing `+` for each one taken down, and sent once the
  /// taps stop — as in a stocktake.
  final _pendingLines = <String, int>{};
  final _lineTimers = <String, Timer>{};
  static const _bumpDebounce = Duration(milliseconds: 800);
  bool _disposing = false;

  bool get _isCheck => widget.mode == ProductionListMode.check;
  HandoutMode get _handoutMode => widget.mode == ProductionListMode.checkin
      ? HandoutMode.checkin
      : HandoutMode.checkout;

  @override
  void initState() {
    super.initState();
    // Listens even while the camera is on top: the camera feeds the bus.
    _sub = ref.read(scanBusProvider).codes.listen(_enqueue);
    unawaited(_start());
    // Others tick at the same time, and nothing tells this screen when.
    _poll = Timer.periodic(const Duration(seconds: 10), (_) => _reload());
  }

  @override
  void dispose() {
    _poll?.cancel();
    _sub?.cancel();
    _disposing = true;
    for (final key in _lineTimers.keys.toList()) {
      _sendLine(key);
    }
    _manualController.dispose();
    _feedback.close();
    super.dispose();
  }

  // ---------------------------------------------------------------------------
  // Loading

  /// A check joins this side's open one, or starts one; a handout list is
  /// just read.
  Future<void> _start() async {
    final api = ref.read(apiClientProvider);
    if (api == null) return;
    try {
      if (_isCheck) {
        final check = await api.productionCheck.startProductionCheck(
          productionId: widget.productionId,
        );
        if (mounted) setState(() => _check = check);
      } else {
        final handout = await api.productionHandout.getProductionHandout(
          productionId: widget.productionId,
          mode: _handoutMode,
          organizationId: _organizationId,
        );
        if (mounted) setState(() => _handout = handout);
      }
    } catch (error) {
      if (mounted) setState(() => _loadError = error);
    }
  }

  Future<void> _fetch(ApiClient api) async {
    if (_isCheck) {
      final check = _check;
      if (check == null) return;
      final fresh = await api.productionCheck.getProductionCheck(checkId: check.id);
      if (mounted) {
        setState(() {
          _check = fresh;
          _stale = false;
        });
      }
    } else {
      final fresh = await api.productionHandout.getProductionHandout(
        productionId: widget.productionId,
        mode: _handoutMode,
        organizationId: _organizationId,
      );
      if (mounted) {
        setState(() {
          _handout = fresh;
          _justBooked.clear();
          _stale = false;
        });
      }
    }
  }

  Future<void> _reload() async {
    final api = ref.read(apiClientProvider);
    if (api == null || !_open || _lineTimers.isNotEmpty || _busy || _waiting > 0) return;
    try {
      await _fetch(api);
    } catch (_) {
      // A missed poll is caught up by the next one.
    }
  }

  bool get _loaded => _isCheck ? _check != null : _handout != null;

  /// Whether ticks can still change: an open check, a handout list (taking
  /// back works even for a cancelled production, handing out does not).
  bool get _open => _isCheck
      ? _check?.status == ProductionCheckStatus.open
      : _handout != null &&
            (widget.mode == ProductionListMode.checkin || !_handout!.cancelled);

  List<ProductionListLine> get _lines =>
      (_isCheck ? _check?.lines : _handout?.lines) ?? const [];

  List<_Unit> _units(S l10n) {
    if (_isCheck) {
      return [
        for (final item in _check?.items ?? const <ProductionCheckItem>[])
          _Unit(
            assetId: item.assetId,
            assetTag: item.assetTag,
            productName: item.productName,
            productCaption: item.productCaption,
            productImageUrl: item.productImageUrl,
            accessoryOf: item.accessoryOf,
            group: item.group,
            kit: item.kit,
            done: item.tick != null,
            locked: item.tick != null && !item.tick!.mine,
            doneBy: item.tick != null && !item.tick!.mine ? item.tick!.userName : null,
            note: _checkNote(l10n, item),
            noteWarn:
                item.lentBy != null &&
                item.status == ProductionCheckItemStatus.checkedOut &&
                !item.received &&
                !item.returnReported,
          ),
      ];
    }
    return [
      for (final item in _handout?.items ?? const <ProductionHandoutItem>[])
        _Unit(
          assetId: item.assetId,
          assetTag: item.assetTag,
          productName: item.productName,
          productCaption: item.productCaption,
          productImageUrl: item.productImageUrl,
          accessoryOf: item.accessoryOf,
          group: item.group,
          kit: item.kit,
          done: item.done,
          locked: false,
          note: _handoutNote(l10n, item),
          noteWarn:
              item.kitAddition == true ||
              item.status == ProductionHandoutItemStatus.checkedOut && !item.received,
          optional: _takenBack(item),
        ),
    ];
  }

  /// On the hand-out list, a unit taken back while the production still runs
  /// is there to send out again if that was a mistake — not something to do.
  bool _takenBack(ProductionHandoutItem item) =>
      widget.mode == ProductionListMode.checkout &&
      item.status == ProductionHandoutItemStatus.returned;

  String? _handoutNote(S l10n, ProductionHandoutItem item) {
    // On the take-back list: booked, but nobody handed it out. A tick books both.
    if (widget.mode == ProductionListMode.checkin &&
        item.status == ProductionHandoutItemStatus.approved) {
      return l10n.productionCheckNotOut;
    }
    if (_takenBack(item)) return l10n.handoutTakenBack;
    if (item.kitAddition == true) return l10n.handoutKitAddition;
    if (item.lentBy == null) return null;
    if (item.returnReported) return l10n.productionCheckReturnReported;
    if (item.status == ProductionHandoutItemStatus.checkedOut && !item.received) {
      return l10n.productionCheckReceiptOpen;
    }
    return null;
  }

  /// Where a unit on a check stands: not handed over yet, or — lent units
  /// only — how far the handover got.
  String? _checkNote(S l10n, ProductionCheckItem item) {
    if (item.status == ProductionCheckItemStatus.approved) {
      return l10n.productionCheckNotOut;
    }
    if (item.lentBy == null) return null;
    if (item.returnReported) return l10n.productionCheckReturnReported;
    if (item.received) return l10n.productionCheckReceived;
    return l10n.productionCheckReceiptOpen;
  }

  /// Sections in the server's order, the counted lines slotted in among the
  /// units by name, and the units a line stands for left out. Mirrors
  /// `listSections` on the web.
  List<_Section> _sections(List<_Unit> units) {
    final counted = {for (final l in _lines) ...l.assetIds};
    final sections = <String, _Section>{};
    _Section section(ProductionCheckGroup g) =>
        sections.putIfAbsent('${g.kind.json}:${g.name ?? ''}', () => _Section(g));

    // Blocks of a unit and its accessories, so a line never lands between them;
    // a kit is one block, under its heading.
    final blocks = <_Section, List<_Block>>{};
    for (final unit in units) {
      if (counted.contains(unit.assetId)) continue;
      final s = section(unit.group);
      final list = blocks.putIfAbsent(s, () => []);
      final last = list.isEmpty ? null : list.last;
      final row = (unit: unit, line: null, kit: null);
      if (unit.accessoryOf != null && last != null && last.id == unit.accessoryOf) {
        last.rows.add(row);
        last.head?.units.add(unit);
      } else if (unit.kit case final kit? when last?.head?.kit.id == kit.id) {
        last!
          ..id = unit.assetId
          ..rows.add(row)
          ..head!.units.add(unit);
      } else if (unit.kit case final kit?) {
        final head = _KitHead(kit)..units.add(unit);
        list.add(
          _Block(unit.assetId, kit.name, [(unit: null, line: null, kit: head), row], head),
        );
      } else {
        list.add(_Block(unit.assetId, unit.productName, [row]));
      }
    }
    for (final line in _lines) {
      final s = section(line.group);
      final list = blocks.putIfAbsent(s, () => []);
      final at = list.indexWhere((b) => naturalCompare(b.name, line.productName) > 0);
      final block = _Block(null, line.productName, [(unit: null, line: line, kit: null)]);
      if (at < 0) {
        list.add(block);
      } else {
        list.insert(at, block);
      }
    }

    const order = {
      ProductionCheckGroupKind.location: 0,
      ProductionCheckGroupKind.none: 1,
      ProductionCheckGroupKind.lender: 2,
    };
    final out = sections.values.toList()
      ..sort((a, b) {
        final byKind = (order[a.group.kind] ?? 3).compareTo(order[b.group.kind] ?? 3);
        return byKind != 0
            ? byKind
            : naturalCompare(a.group.name ?? '', b.group.name ?? '');
      });
    for (final s in out) {
      for (final b in blocks[s] ?? const <_Block>[]) {
        s.rows.addAll(b.rows);
      }
    }
    return out;
  }

  Future<void> _pickSide(String organizationId) async {
    setState(() => _organizationId = organizationId);
    final api = ref.read(apiClientProvider);
    if (api == null) return;
    setState(() => _busy = true);
    try {
      await _fetch(api);
    } catch (error) {
      if (mounted) setState(() => _loadError = error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  int _lineCount(ProductionListLine line) => _pendingLines[line.key] ?? line.done;

  // ---------------------------------------------------------------------------
  // Scanning

  void _enqueue(String code) {
    final trimmed = code.trim();
    if (trimmed.isEmpty) return;
    _waiting++;
    _queue = _queue.then((_) => _submit(trimmed)).whenComplete(() => _waiting--);
  }

  void _submitManual() {
    // Not through the scan bus: a retyped tag is meant, and the bus would
    // swallow it as an echo.
    _enqueue(_manualController.text);
    _manualController.clear();
  }

  Future<void> _submit(String code) async {
    final api = ref.read(apiClientProvider);
    if (!mounted || api == null || !_open) return;
    // Read before the first await — see SessionScreen._submit.
    final l10n = S.of(context);

    setState(() => _busy = true);
    try {
      final scanned = _isCheck
          ? await _scanCheck(api, l10n, code)
          : await _scanHandout(api, l10n, code);
      final unitAssetId = scanned.unit;
      // The accessory question reads the list, so it needs the fresh one.
      final ask = unitAssetId != null && _hasAccessories(unitAssetId);
      if (_waiting <= 1 || ask) {
        await _fetch(api);
      } else {
        _stale = true;
      }
      if (mounted) setState(() => _busy = false);
      // Asked inside the queue, so the next scan waits for the answer.
      if (ask) await _askAccessories(unitAssetId);
      if (scanned.kit case final kit?) await _askKit(kit);
    } catch (error) {
      _report(_Tone.bad, describeError(l10n, error), code, ScanTone.error);
    } finally {
      // The run's last scan failed: the ones before it still want showing.
      if (_stale && _waiting <= 1) await _fetch(api).catchError((_) {});
      if (mounted) setState(() => _busy = false);
    }
  }

  /// Ticks the scanned unit; answers it, if it is on the list and was ticked
  /// just now, so its accessories can be asked about — or the kit whose
  /// sticker it was, so its units can be. The scan answers with the unit's
  /// tag rather than its id.
  Future<_Scanned> _scanCheck(ApiClient api, S l10n, String code) async {
    final result = await api.productionCheck.scanIntoProductionCheck(
      checkId: _check!.id,
      body: ProductionCheckScanRequest(code: code),
    );
    if (result.kit case final kit?
        when result.result == ProductionCheckScanResultResult.ticked) {
      _report(
        _Tone.good,
        l10n.kitScanned(kit.name, kit.units.length),
        kit.tag,
        ScanTone.ok,
      );
      return (unit: null, kit: kit);
    }
    switch (result.result) {
      case ProductionCheckScanResultResult.ticked:
        // One unit of a kit: the rest of it is offered, as when handing out.
        final rest = [
          for (final u in result.group?.units ?? const <ScanGroupUnit>[])
            if (!u.done) u.id,
        ];
        _report(
          rest.isEmpty ? _Tone.good : _Tone.warn,
          result.ticked > 1
              ? l10n.productionCheckWithAccessories(result.productName, result.ticked - 1)
              : result.productName,
          result.assetTag,
          rest.isEmpty ? ScanTone.ok : ScanTone.attention,
        );
        if (rest.isNotEmpty && mounted) {
          setState(
            () => _offer = (
              label: l10n.handoutRestOf(result.group!.name, rest.length),
              assetIds: rest,
            ),
          );
        }
        return (
          unit: _check?.items
              .where((i) => i.assetTag == result.assetTag)
              .firstOrNull
              ?.assetId,
          kit: null,
        );
      case ProductionCheckScanResultResult.already:
        _report(
          _Tone.info,
          '${l10n.productionCheckAlready}: ${result.productName}',
          result.assetTag,
          ScanTone.already,
        );
      default:
        _report(
          _Tone.warn,
          '${l10n.productionCheckNotOnList}: ${result.productName}',
          result.assetTag,
          ScanTone.attention,
        );
    }
    return _nothingToAsk;
  }

  static const _Scanned _nothingToAsk = (unit: null, kit: null);

  /// Books the scanned unit; answers it when it went where this list books
  /// to, so its accessories can be asked about — or the kit whose sticker it
  /// was, which booked all of it.
  Future<_Scanned> _scanHandout(ApiClient api, S l10n, String code) async {
    final result = await api.productionHandout.scanIntoProductionHandout(
      productionId: widget.productionId,
      mode: _handoutMode,
      body: ProductionCheckScanRequest(code: code),
    );
    if (result.kit case final kit?) return _kitBooked(l10n, kit, result.action);
    final rest = [
      for (final u in result.group?.units ?? const <ScanGroupUnit>[])
        if (!u.done) u.id,
    ];
    final returned = result.returnedFrom;
    // Taking back puts any unit on its shelf, but only one that came from this
    // production is a return; anything else is said so.
    final foreign =
        result.action != ScanResultAction.checkedOut &&
        !returned.contains(_handout?.productionName ?? widget.productionName);
    final name = withCaption(
      productLabel(result.asset.manufacturerName, result.asset.productName),
      result.asset.productCaption,
    );
    // The server books a unit that is already out once more without a word,
    // and a second green "handed out" reads as if it had not been the first
    // time — so a unit that was ticked before this scan is said to be.
    final already =
        !foreign &&
        (_justBooked.contains(result.asset.id) ||
            (_handout?.items.any((i) => i.assetId == result.asset.id && i.done) ?? false));
    _justBooked.add(result.asset.id);
    if (already) {
      _report(
        _Tone.info,
        '${l10n.productionCheckAlready}: $name',
        result.asset.assetTag,
        ScanTone.already,
      );
      return _nothingToAsk;
    }
    _report(
      rest.isEmpty && !foreign ? _Tone.good : _Tone.warn,
      foreign ? '${l10n.productionCheckNotOnList}: $name' : name,
      [
        result.asset.assetTag,
        Labels.scanAction(l10n, result.action),
        if (returned.isNotEmpty) l10n.returnedFrom(returned.join(', ')),
      ].join(' · '),
      rest.isEmpty && !foreign ? ScanTone.ok : ScanTone.attention,
    );
    if (rest.isNotEmpty && mounted) {
      setState(
        () => _offer = (
          label: l10n.handoutRestOf(result.group!.name, rest.length),
          assetIds: rest,
        ),
      );
    }
    return (unit: foreign ? null : result.asset.id, kit: null);
  }

  /// A kit's sticker booked every unit in it that this list has. None of them
  /// here means the kit is not from this production; all of them done before
  /// is said like a second scan of one unit.
  _Scanned _kitBooked(S l10n, ScanKit kit, ScanResultAction action) {
    if (kit.units.isEmpty) {
      _report(
        _Tone.warn,
        '${l10n.productionCheckNotOnList}: ${kit.name}',
        kit.tag,
        ScanTone.attention,
      );
      return _nothingToAsk;
    }
    final already = kit.units.every(
      (u) =>
          _justBooked.contains(u.id) ||
          (_handout?.items.any((i) => i.assetId == u.id && i.done) ?? false),
    );
    _justBooked.addAll(kit.units.map((u) => u.id));
    if (already) {
      _report(
        _Tone.info,
        '${l10n.productionCheckAlready}: ${kit.name}',
        kit.tag,
        ScanTone.already,
      );
      return _nothingToAsk;
    }
    _report(
      _Tone.good,
      l10n.kitScanned(kit.name, kit.units.length),
      [?kit.tag, Labels.scanAction(l10n, action)].join(' · '),
      ScanTone.ok,
    );
    return (unit: null, kit: kit);
  }

  /// After a kit's sticker: is all of it there? Booked back (or unticked) is
  /// what was unticked, with what hangs off it.
  Future<void> _askKit(ScanKit kit) async {
    if (!mounted) return;
    final l10n = S.of(context);
    final there = await showDialog<Set<String>>(
      context: context,
      builder: (_) => AccessoryDialog(
        title: l10n.kitDialogTitle(kit.name),
        question: switch (widget.mode) {
          ProductionListMode.check => l10n.accessoryDialogCheck,
          ProductionListMode.checkout => l10n.accessoryDialogCheckout,
          ProductionListMode.checkin => l10n.accessoryDialogCheckin,
        },
        accessories: [
          for (final u in kit.units)
            (
              assetId: u.id,
              name: withCaption(
                productLabel(u.manufacturerName, u.productName),
                u.productCaption,
              ),
              assetTag: u.assetTag,
              imageUrl: u.productImageUrl,
            ),
        ],
      ),
    );
    if (there == null) return;
    final missing = {
      for (final u in kit.units)
        if (!there.contains(u.id)) u.id,
    };
    if (missing.isEmpty) return;
    // On a check the accessories were ticked along, and are missing along.
    final untick = {
      ...missing,
      for (final i in _check?.items ?? const <ProductionCheckItem>[])
        if (missing.contains(i.accessoryOf)) i.assetId,
    };
    _justBooked.removeAll(missing);
    await _act((api) async {
      await _tick(api, untick.toList(), done: false);
      return null;
    });
    _report(
      _Tone.warn,
      l10n.kitScanned(kit.name, kit.units.length - missing.length),
      l10n.kitLeftOut(missing.length),
      ScanTone.attention,
    );
  }

  void _report(_Tone tone, String title, String? detail, ScanTone sound) {
    if (!mounted) return;
    setState(() {
      _last = (tone: tone, title: title, detail: detail);
      _offer = null;
    });
    _feedback.add(
      CameraScanFeedback(
        ok: tone != _Tone.bad && tone != _Tone.warn,
        title: title,
        detail: detail ?? '',
      ),
    );
    ref.scanTone(sound);
  }

  // ---------------------------------------------------------------------------
  // Ticking and counting

  /// Runs one server action and reloads, reporting a failure in the banner.
  Future<void> _act(Future<String?> Function(ApiClient api) action) async {
    final api = ref.read(apiClientProvider);
    if (api == null) return;
    final l10n = S.of(context);
    setState(() => _busy = true);
    try {
      final message = await action(api);
      await _fetch(api);
      if (!mounted) return;
      if (message != null) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
      }
    } catch (error) {
      _report(_Tone.bad, describeError(l10n, error), null, ScanTone.error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// Ticks units: notes them on a check, books them on a handout list.
  Future<void> _tick(ApiClient api, List<String> assetIds, {bool done = true}) async {
    if (assetIds.isEmpty) return;
    if (_isCheck) {
      if (done) {
        await api.productionCheck.tickProductionCheckItems(
          checkId: _check!.id,
          body: ProductionCheckTickRequest(assetIds: assetIds),
        );
      } else {
        for (final id in assetIds) {
          await api.productionCheck.untickProductionCheckItem(
            checkId: _check!.id,
            assetId: id,
          );
        }
      }
    } else {
      await api.productionHandout.tickProductionHandout(
        productionId: widget.productionId,
        mode: _handoutMode,
        body: ProductionHandoutTickRequest(assetIds: assetIds, done: done),
      );
    }
  }

  Future<void> _toggle(_Unit unit) async {
    await _act((api) async {
      await _tick(api, [unit.assetId], done: !unit.done);
      return null;
    });
    if (!unit.done) await _askAccessories(unit.assetId);
  }

  /// After a unit went on the list, asks whether what hangs off it is there
  /// too — see AccessoryDialog. The list is the freshly loaded one, so it
  /// shows what the server booked along; the answer ticks or unticks the
  /// accessories one by one to match. Ticks somebody else made are theirs,
  /// and are not asked about.
  bool _hasAccessories(String unitAssetId) =>
      _check?.items.any((i) => i.accessoryOf == unitAssetId) ??
      _handout?.items.any((i) => i.accessoryOf == unitAssetId) ??
      false;

  Future<void> _askAccessories(String unitAssetId) async {
    if (!mounted) return;
    final l10n = S.of(context);
    final units = _units(l10n);
    final unit = units.where((u) => u.assetId == unitAssetId).firstOrNull;
    final accessories = [
      for (final u in units)
        if (u.accessoryOf == unitAssetId && !u.locked) u,
    ];
    if (unit == null || accessories.isEmpty) return;
    final there = await showDialog<Set<String>>(
      context: context,
      builder: (_) => AccessoryDialog(
        title: l10n.accessoryDialogTitle(unit.productName),
        question: switch (widget.mode) {
          ProductionListMode.check => l10n.accessoryDialogCheck,
          ProductionListMode.checkout => l10n.accessoryDialogCheckout,
          ProductionListMode.checkin => l10n.accessoryDialogCheckin,
        },
        accessories: [
          for (final a in accessories)
            (
              assetId: a.assetId,
              name: a.productName,
              assetTag: a.assetTag,
              imageUrl: a.productImageUrl,
            ),
        ],
      ),
    );
    if (there == null) return;
    final tick = [
      for (final a in accessories)
        if (there.contains(a.assetId) && !a.done) a.assetId,
    ];
    final untick = [
      for (final a in accessories)
        if (!there.contains(a.assetId) && a.done) a.assetId,
    ];
    if (tick.isEmpty && untick.isEmpty) return;
    await _act((api) async {
      await _tick(api, tick);
      await _tick(api, untick, done: false);
      return null;
    });
  }

  /// Every open unit of these rows, the counted lines' included — they are
  /// units too.
  void _tickRows(List<_Row> rows) {
    final ids = <String>[];
    final lines = <ProductionListLine>[];
    for (final row in rows) {
      if (row.unit case final u? when !u.done && !u.locked && !u.optional) {
        ids.add(u.assetId);
      }
      if (row.line case final l? when _lineCount(l) < l.total) lines.add(l);
    }
    _act((api) async {
      await _tick(api, ids);
      for (final line in lines) {
        await _setLine(api, line.key, line.total);
      }
      return null;
    });
  }

  Future<void> _setLine(ApiClient api, String key, int count) async {
    final body = ProductionListLineCount(key: key, count: count);
    if (_isCheck) {
      await api.productionCheck.setProductionCheckLine(checkId: _check!.id, body: body);
    } else {
      await api.productionHandout.setProductionHandoutLine(
        productionId: widget.productionId,
        mode: _handoutMode,
        body: body,
      );
    }
  }

  void _bumpLine(ProductionListLine line) {
    final next = _lineCount(line) + 1;
    if (next > line.total) return;
    setState(() => _pendingLines[line.key] = next);
    _lineTimers[line.key]?.cancel();
    _lineTimers[line.key] = Timer(_bumpDebounce, () => _sendLine(line.key));
  }

  Future<void> _countLine(ProductionListLine line) async {
    final l10n = S.of(context);
    final count = await showDialog<int>(
      context: context,
      builder: (_) => CountDialog(
        title: withCaption(
          productLabel(line.manufacturerName, line.productName),
          line.productCaption,
        ),
        // Opened to confirm the whole line far more often than to count a
        // part of it: the booked number is the one to accept with one tap.
        initial: line.total,
        label: l10n.listHowMany(line.total),
        imageUrl: line.productImageUrl,
        max: line.total,
      ),
    );
    if (count == null || !mounted) return;
    _lineTimers.remove(line.key)?.cancel();
    setState(() => _pendingLines[line.key] = count);
    _sendLine(line.key);
  }

  void _sendLine(String key) {
    _lineTimers.remove(key)?.cancel();
    final count = _pendingLines[key];
    if (count == null) return;
    final api = ref.read(apiClientProvider);
    if (api == null) return;
    if (_disposing || !mounted) {
      // Leaving the screen with taps still waiting: send them anyway.
      unawaited(_setLine(api, key, count).catchError((_) {}));
      return;
    }
    _queue = _queue.then(
      (_) =>
          _act((api) async {
            await _setLine(api, key, count);
            return null;
          }).whenComplete(() {
            if (mounted && _pendingLines[key] == count && !_lineTimers.containsKey(key)) {
              setState(() => _pendingLines.remove(key));
            }
          }),
    );
  }

  // ---------------------------------------------------------------------------
  // A check's own steps

  void _confirmReceipt() {
    final l10n = S.of(context);
    _act((api) async {
      final result = await api.productionCheck.confirmProductionCheckReceipt(
        checkId: _check!.id,
      );
      return l10n.productionCheckReceiptDone(result.count);
    });
  }

  void _reportReturn() {
    final l10n = S.of(context);
    _act((api) async {
      final result = await api.productionCheck.reportProductionCheckReturn(
        checkId: _check!.id,
      );
      return l10n.productionCheckReturnDone(result.count);
    });
  }

  void _finish() {
    final l10n = S.of(context);
    _act((api) async {
      final result = await api.productionCheck.closeProductionCheck(checkId: _check!.id);
      return l10n.productionCheckSaved(result.found, result.missing);
    });
  }

  Future<void> _openCamera() => Navigator.of(context).push<void>(
    MaterialPageRoute(
      builder: (_) => CameraScanScreen(
        title: widget.productionName,
        continuous: true,
        feedback: _feedback.stream,
      ),
    ),
  );

  // ---------------------------------------------------------------------------
  // Drawing

  String _title(S l10n) => switch (widget.mode) {
    ProductionListMode.check => l10n.productionCheck,
    ProductionListMode.checkout => l10n.productionActionBook,
    ProductionListMode.checkin => l10n.productionActionReturn,
  };

  @override
  Widget build(BuildContext context) {
    final l10n = S.of(context);
    final open = _open;
    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(widget.productionName, overflow: TextOverflow.ellipsis),
            Text(_title(l10n), style: Theme.of(context).textTheme.bodySmall),
          ],
        ),
        actions: [
          if (open && ref.watch(scanSettingsProvider).cameraEnabled)
            IconButton(
              tooltip: l10n.scanWithCamera,
              onPressed: _openCamera,
              icon: const Icon(Icons.photo_camera_outlined),
            ),
        ],
      ),
      body: Column(
        children: [
          if (open)
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 12, 12, 4),
              child: TextField(
                controller: _manualController,
                textInputAction: TextInputAction.done,
                decoration: InputDecoration(
                  labelText: l10n.manualEntry,
                  prefixIcon: const Icon(Icons.qr_code_scanner),
                ),
                onSubmitted: (_) => _submitManual(),
              ),
            ),
          if (_busy || !_loaded && _loadError == null)
            const LinearProgressIndicator()
          else
            const SizedBox(height: 4),
          if (_last case final last?)
            _FeedbackBanner(
              last.tone,
              last.title,
              last.detail,
              action: switch (_offer) {
                final offer? => (
                  label: offer.label,
                  onPressed: _busy
                      ? null
                      : () {
                          setState(() => _offer = null);
                          _act((api) async {
                            await _tick(api, offer.assetIds);
                            return null;
                          });
                        },
                ),
                null => null,
              },
            ),
          Expanded(
            child: _loaded
                ? _list(l10n)
                : _loadError != null
                ? Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Text(
                        describeError(l10n, _loadError!),
                        textAlign: TextAlign.center,
                      ),
                    ),
                  )
                : const SizedBox.shrink(),
          ),
          if (_loaded) _footer(l10n),
        ],
      ),
    );
  }

  Widget _list(S l10n) {
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final status = Theme.of(context).extension<StatusColors>();
    final open = _open;
    final units = _units(l10n);
    final sections = _sections(units);
    final counted = {for (final l in _lines) ...l.assetIds};
    final owed = units.where((u) => !u.optional || u.done);
    final total = owed.length;
    final done =
        owed.where((u) => u.done && !counted.contains(u.assetId)).length +
        _lines.fold<int>(0, (n, l) => n + _lineCount(l));
    final check = _check;
    final handout = _handout;

    return ListView(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.only(bottom: 16),
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                l10n.caseCheckProgress(done, total),
                style: const TextStyle(fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 6),
              LinearProgressIndicator(value: total == 0 ? 1 : done / total),
              const SizedBox(height: 6),
              if (check != null)
                Text(
                  check.side.own
                      ? l10n.productionCheckEverything
                      : l10n.productionCheckUnitsOf(check.side.organizationName),
                  style: TextStyle(color: muted, fontSize: 12),
                ),
              if (check != null && check.status != ProductionCheckStatus.open)
                Text(l10n.productionCheckClosed, style: TextStyle(color: muted)),
              if (handout != null)
                Text(
                  widget.mode == ProductionListMode.checkout
                      ? l10n.productionActionBookHint
                      : l10n.productionActionReturnHint,
                  style: TextStyle(color: muted, fontSize: 12),
                ),
              if (handout != null && !open)
                Text(l10n.handoutCancelled, style: TextStyle(color: muted)),
              if (handout != null && handout.sides.length > 1) ...[
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 4,
                  children: [
                    for (final side in handout.sides)
                      ChoiceChip(
                        label: Text(
                          side.own
                              ? l10n.productionCheckEverything
                              : l10n.productionCheckUnitsOf(side.organizationName),
                        ),
                        selected: side.organizationId == handout.side.organizationId,
                        onSelected: _busy ? null : (_) => _pickSide(side.organizationId),
                      ),
                  ],
                ),
              ],
            ],
          ),
        ),
        const Divider(),
        if (units.isEmpty)
          Padding(
            padding: const EdgeInsets.all(24),
            child: Center(
              child: Text(switch (widget.mode) {
                ProductionListMode.check => l10n.productionCheckEmpty,
                ProductionListMode.checkout => l10n.handoutEmptyCheckout,
                ProductionListMode.checkin => l10n.handoutEmptyCheckin,
              }, textAlign: TextAlign.center),
            ),
          ),
        for (final section in sections) ...[
          _sectionHeader(l10n, section, open),
          for (final row in section.rows)
            if (row.line case final line?)
              _lineTile(l10n, line, open)
            else if (row.kit case final head?)
              _kitHeader(l10n, head, open)
            else if (row.unit case final unit?)
              _unitTile(l10n, unit, open),
        ],
        if (handout != null && handout.othersCount > 0)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
            child: Text(
              handout.side.own
                  ? l10n.handoutOthers(handout.othersCount)
                  : l10n.handoutOthersElsewhere(handout.othersCount),
              style: TextStyle(color: muted, fontSize: 12),
            ),
          ),
        if (check != null && check.unexpected.isNotEmpty) ...[
          const Divider(),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 4),
            child: Text(
              l10n.productionCheckNotOnList,
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
          ),
          for (final u in check.unexpected)
            ListTile(
              dense: true,
              leading: Icon(Icons.warning_amber_outlined, color: status?.warning),
              title: Text(u.productName),
              subtitle: Text(
                u.assetTag ?? '—',
                style: const TextStyle(fontFamily: 'monospace'),
              ),
            ),
        ],
      ],
    );
  }

  Widget _unitTile(S l10n, _Unit unit, bool open) {
    final status = Theme.of(context).extension<StatusColors>();
    final doneLabel = switch (widget.mode) {
      ProductionListMode.check => null,
      ProductionListMode.checkout => l10n.handoutOut,
      ProductionListMode.checkin => l10n.handoutBack,
    };
    final onChanged = open && !unit.locked && !_busy ? (_) => _toggle(unit) : null;
    // The checkbox and the picture side by side, as on the web; a
    // CheckboxListTile has room for only one of them in front.
    return ListTile(
      dense: true,
      contentPadding: EdgeInsets.only(
        left: (unit.accessoryOf == null ? 8 : 40) + (unit.kit == null ? 0 : 16),
        right: 16,
      ),
      leading: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Checkbox(value: unit.done, onChanged: onChanged),
          ProductThumb(url: unit.productImageUrl),
        ],
      ),
      onTap: onChanged == null ? null : () => onChanged(null),
      title: Text(unit.productName, style: const TextStyle(fontWeight: FontWeight.w600)),
      subtitle: Text.rich(
        TextSpan(
          children: [
            TextSpan(
              text: [
                unit.assetTag ?? l10n.caseCheckNoTag,
                ?unit.productCaption,
                if (unit.doneBy case final by?) l10n.productionCheckFoundBy(by),
                if (unit.done && doneLabel != null) doneLabel,
              ].join(' · '),
            ),
            if (unit.note case final note?)
              TextSpan(
                text: ' · $note',
                style: unit.noteWarn ? TextStyle(color: status?.warning) : null,
              ),
          ],
        ),
      ),
    );
  }

  Widget _lineTile(S l10n, ProductionListLine line, bool open) {
    final count = _lineCount(line);
    final complete = count >= line.total;
    final status = Theme.of(context).extension<StatusColors>();
    return ListTile(
      dense: true,
      contentPadding: const EdgeInsets.only(left: 20, right: 8),
      leading: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            complete ? Icons.check_box : Icons.check_box_outline_blank,
            color: complete ? status?.success : null,
          ),
          const SizedBox(width: 12),
          ProductThumb(url: line.productImageUrl),
        ],
      ),
      title: Text(line.productName, style: const TextStyle(fontWeight: FontWeight.w600)),
      subtitle: Text([l10n.listCountedLine, ?line.productCaption].join(' · ')),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            '$count / ${line.total}',
            style: const TextStyle(
              fontWeight: FontWeight.w600,
              fontFeatures: [FontFeature.tabularFigures()],
            ),
          ),
          if (open)
            IconButton(
              tooltip: l10n.stocktakePlusOne,
              onPressed: complete || _busy ? null : () => _bumpLine(line),
              icon: const Icon(Icons.add),
            ),
        ],
      ),
      onTap: open && !_busy ? () => _countLine(line) : null,
    );
  }

  /// A kit's name over its units, with how many are done and a tick for the
  /// rest of them.
  Widget _kitHeader(S l10n, _KitHead head, bool open) {
    final owed = head.units.where((u) => !u.optional || u.done).toList();
    final done = owed.where((u) => u.done).length;
    final rest = owed.where((u) => !u.done && !u.locked).toList();
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    return Container(
      color: Theme.of(context).colorScheme.surfaceContainerHighest.withValues(alpha: 0.5),
      padding: const EdgeInsets.fromLTRB(16, 4, 8, 4),
      child: Row(
        children: [
          Icon(Icons.inventory_2_outlined, size: 18, color: muted),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              [head.kit.name, ?head.kit.tag].join(' · '),
              style: const TextStyle(fontWeight: FontWeight.w600),
              overflow: TextOverflow.ellipsis,
            ),
          ),
          Text(
            '$done/${owed.length}',
            style: TextStyle(
              color: muted,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
          if (open && rest.isNotEmpty)
            TextButton(
              onPressed: _busy
                  ? null
                  : () =>
                        _tickRows([for (final u in rest) (unit: u, line: null, kit: null)]),
              child: Text(l10n.listTickKit),
            )
          else
            const SizedBox(height: 40),
        ],
      ),
    );
  }

  Widget _sectionHeader(S l10n, _Section section, bool open) {
    var done = 0;
    var total = 0;
    for (final row in section.rows) {
      if (row.line case final l?) {
        done += _lineCount(l);
        total += l.total;
      } else if (row.unit case final u? when !u.optional || u.done) {
        total += 1;
        if (u.done) done += 1;
      }
    }
    final group = section.group;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 8, 0),
      child: Row(
        children: [
          Icon(
            group.kind == ProductionCheckGroupKind.lender
                ? Icons.handshake_outlined
                : Icons.place_outlined,
            size: 18,
            color: muted,
          ),
          const SizedBox(width: 6),
          Expanded(
            child: Text(
              '${switch (group.kind) {
                ProductionCheckGroupKind.lender => l10n.productionCheckLentBySection(group.name ?? ''),
                ProductionCheckGroupKind.location => group.name ?? '',
                _ => l10n.productionCheckNoLocation,
              }}  $done/$total',
              style: const TextStyle(fontWeight: FontWeight.w600),
              overflow: TextOverflow.ellipsis,
            ),
          ),
          if (open && done < total)
            TextButton(
              onPressed: _busy ? null : () => _tickRows(section.rows),
              child: Text(l10n.productionCheckTickSection),
            ),
        ],
      ),
    );
  }

  Widget _footer(S l10n) {
    final units = _units(l10n);
    final sections = _sections(units);
    final allRows = [for (final s in sections) ...s.rows];
    var open = 0;
    for (final row in allRows) {
      if (row.line case final l?) open += l.total - _lineCount(l);
      if (row.unit case final u? when !u.done && !u.optional) open += 1;
    }
    final isOpen = _open;
    final check = _check;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    return SafeArea(
      top: false,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
        decoration: BoxDecoration(
          border: Border(top: BorderSide(color: Theme.of(context).dividerColor)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(switch ((widget.mode, open)) {
              (ProductionListMode.check, 0) => l10n.caseCheckComplete,
              (ProductionListMode.check, _) => l10n.caseCheckMissingCount(open),
              (ProductionListMode.checkout, 0) => l10n.handoutAllOut,
              (ProductionListMode.checkin, 0) => l10n.handoutAllBack,
              _ => l10n.handoutOpen(open),
            }, style: const TextStyle(fontWeight: FontWeight.w600)),
            if (check != null &&
                (check.canConfirmReceipt > 0 || check.canReportReturn > 0)) ...[
              const SizedBox(height: 4),
              Text(
                l10n.productionCheckLentHint,
                style: TextStyle(color: muted, fontSize: 12),
              ),
              const SizedBox(height: 4),
              if (check.canConfirmReceipt > 0)
                FilledButton.tonal(
                  onPressed: _busy ? null : _confirmReceipt,
                  child: Text(l10n.productionCheckConfirmReceipt(check.canConfirmReceipt)),
                ),
              if (check.canReportReturn > 0)
                OutlinedButton(
                  onPressed: _busy ? null : _reportReturn,
                  child: Text(l10n.productionCheckReportReturn(check.canReportReturn)),
                ),
            ],
            if (isOpen && (open > 0 || _isCheck)) ...[
              const SizedBox(height: 8),
              Row(
                children: [
                  if (open > 0)
                    Expanded(
                      child: OutlinedButton(
                        onPressed: _busy ? null : () => _tickRows(allRows),
                        child: Text(l10n.productionCheckTickAll),
                      ),
                    ),
                  if (open > 0 && _isCheck) const SizedBox(width: 8),
                  if (_isCheck)
                    Expanded(
                      child: FilledButton(
                        onPressed: _busy ? null : _finish,
                        child: Text(l10n.productionCheckFinish),
                      ),
                    ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _FeedbackBanner extends StatelessWidget {
  const _FeedbackBanner(this.tone, this.title, this.detail, {this.action});

  final _Tone tone;
  final String title;
  final String? detail;
  final ({String label, VoidCallback? onPressed})? action;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final status = Theme.of(context).extension<StatusColors>();
    final color = switch (tone) {
      _Tone.good => status?.success ?? scheme.primary,
      _Tone.warn => status?.warning ?? scheme.tertiary,
      _Tone.bad => scheme.error,
      _Tone.info => scheme.onSurfaceVariant,
    };
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.fromLTRB(12, 4, 12, 4),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        border: Border.all(color: color.withValues(alpha: 0.5)),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: TextStyle(fontWeight: FontWeight.w600, color: color),
          ),
          if (detail case final d? when d.isNotEmpty)
            Text(d, style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant)),
          if (action case final a?)
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(onPressed: a.onPressed, child: Text(a.label)),
            ),
        ],
      ),
    );
  }
}
