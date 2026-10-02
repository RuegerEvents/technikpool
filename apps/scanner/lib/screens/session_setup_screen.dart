import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../api/client.dart';
import '../api/generated/export.dart';
import '../l10n/generated/app_localizations.dart';
import '../natural_sort.dart';
import '../state/providers.dart';
import 'case_check_screen.dart';
import 'production_list_screen.dart';
import 'session_screen.dart';
import 'stocktake_new_screen.dart';
import 'stocktake_screen.dart';

/// The three things a batch of scans can go to. The first two book equipment;
/// a stocktake only counts it.
enum _Mode { location, production, stocktake }

/// What a tap on a production offers — see `_open`.
enum _ProductionAction { book, takeBack, check }

/// Pick what the next batch of scans books against, mirroring the web app's
/// /checkout setup step — or the stocktake it counts into.
class SessionSetupScreen extends ConsumerStatefulWidget {
  const SessionSetupScreen({super.key});

  @override
  ConsumerState<SessionSetupScreen> createState() => _SessionSetupScreenState();
}

class _SessionSetupScreenState extends ConsumerState<SessionSetupScreen> {
  _Mode _mode = _Mode.location;
  String _query = '';

  /// A shelf is a plain run of scans, each one booked onto it.
  void _start(String id, String name) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => SessionScreen(
          targetType: ScanRequestTargetType.location,
          targetId: id,
          targetName: name,
        ),
      ),
    );
  }

  /// A production is worked through as its list — handed out, taken back or
  /// checked — by scan, by tick, or by count for what has no tag.
  void _list(String id, String name, ProductionListMode mode) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) =>
            ProductionListScreen(productionId: id, productionName: name, mode: mode),
      ),
    );
  }

  /// A production can be handed out, taken back or checked, and a second
  /// button on the row read as the same action as the row itself — so the row
  /// asks. A location, or crew who may check but not book, has nothing to ask.
  Future<void> _open(({String id, String name, String subtitle, bool book, bool check}) row) async {
    if (_mode == _Mode.location) return _start(row.id, row.name);
    if (!row.book) return _list(row.id, row.name, ProductionListMode.check);
    final l10n = S.of(context);
    final choice = await showModalBottomSheet<_ProductionAction>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 0, 24, 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(row.name, style: Theme.of(context).textTheme.titleMedium),
                  if (row.subtitle.isNotEmpty)
                    Text(
                      row.subtitle,
                      style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant),
                    ),
                ],
              ),
            ),
            ListTile(
              contentPadding: const EdgeInsets.symmetric(horizontal: 24, vertical: 4),
              leading: const Icon(Icons.outbox_outlined),
              title: Text(l10n.productionActionBook),
              subtitle: Text(l10n.productionActionBookHint),
              onTap: () => Navigator.of(context).pop(_ProductionAction.book),
            ),
            ListTile(
              contentPadding: const EdgeInsets.symmetric(horizontal: 24, vertical: 4),
              leading: const Icon(Icons.assignment_return_outlined),
              title: Text(l10n.productionActionReturn),
              subtitle: Text(l10n.productionActionReturnHint),
              onTap: () => Navigator.of(context).pop(_ProductionAction.takeBack),
            ),
            if (row.check)
              ListTile(
                contentPadding: const EdgeInsets.symmetric(horizontal: 24, vertical: 4),
                leading: const Icon(Icons.checklist),
                title: Text(l10n.productionCheck),
                subtitle: Text(l10n.productionActionCheckHint),
                onTap: () => Navigator.of(context).pop(_ProductionAction.check),
              ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
    if (!mounted) return;
    switch (choice) {
      case _ProductionAction.book:
        _list(row.id, row.name, ProductionListMode.checkout);
      case _ProductionAction.takeBack:
        _list(row.id, row.name, ProductionListMode.checkin);
      case _ProductionAction.check:
        _list(row.id, row.name, ProductionListMode.check);
      case null:
        break;
    }
  }

  Future<void> _newStocktake() async {
    final created = await Navigator.of(context).push<StocktakeSummary>(
      MaterialPageRoute(builder: (_) => const StocktakeNewScreen()),
    );
    ref.invalidate(openStocktakesProvider);
    if (created != null && mounted) await _openStocktake(created);
  }

  Future<void> _openStocktake(StocktakeSummary stocktake) async {
    final location = await pickCountingLocation(context, ref, stocktake);
    if (location == null || !mounted) return;
    await Navigator.of(context).push<void>(
      MaterialPageRoute(
        builder: (_) => StocktakeScreen(stocktakeId: stocktake.id, location: location),
      ),
    );
    ref.invalidate(openStocktakesProvider);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = S.of(context);
    final isStocktake = _mode == _Mode.stocktake;
    final async = switch (_mode) {
      _Mode.location => ref.watch(locationsProvider),
      _Mode.production => ref.watch(productionsProvider),
      _Mode.stocktake => ref.watch(openStocktakesProvider),
    };

    return Scaffold(
      // HomeScreen's Scaffold owns the keyboard inset for every tab.
      resizeToAvoidBottomInset: false,
      appBar: AppBar(title: Text(l10n.startSession)),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: SegmentedButton<_Mode>(
              // Three segments on a handheld in portrait: an icon beside each
              // label leaves "Lagerort" room for five letters, so the icon goes
              // on top and the label never wraps.
              showSelectedIcon: false,
              style: const ButtonStyle(
                padding: WidgetStatePropertyAll(
                  EdgeInsets.symmetric(horizontal: 4, vertical: 6),
                ),
              ),
              segments: [
                ButtonSegment(
                  value: _Mode.location,
                  label: _SegmentLabel(Icons.warehouse_outlined, l10n.location),
                ),
                ButtonSegment(
                  value: _Mode.production,
                  label: _SegmentLabel(Icons.event_outlined, l10n.production),
                ),
                ButtonSegment(
                  value: _Mode.stocktake,
                  label: _SegmentLabel(Icons.fact_check_outlined, l10n.stocktake),
                ),
              ],
              selected: {_mode},
              onSelectionChanged: (s) => setState(() => _mode = s.first),
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
            child: TextField(
              decoration: InputDecoration(
                labelText: l10n.search,
                prefixIcon: Icon(Icons.search),
              ),
              onChanged: (v) => setState(() => _query = v.toLowerCase().trim()),
            ),
          ),
          Expanded(
            child: async.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (error, _) => _ErrorView(
                message: describeError(l10n, error),
                onRetry: () => ref.invalidate(switch (_mode) {
                  _Mode.location => locationsProvider,
                  _Mode.production => productionsProvider,
                  _Mode.stocktake => openStocktakesProvider,
                }),
              ),
              data: (items) {
                if (isStocktake) {
                  return _StocktakeList(
                    stocktakes: items
                        .cast<StocktakeSummary>()
                        .where(
                          (s) => _query.isEmpty || s.name.toLowerCase().contains(_query),
                        )
                        .toList(),
                    onOpen: _openStocktake,
                    onNew: _newStocktake,
                    onCaseCheck: () => Navigator.of(context).push<void>(
                      MaterialPageRoute(builder: (_) => const CaseCheckScreen()),
                    ),
                    onRefresh: () => ref.refresh(openStocktakesProvider.future),
                  );
                }
                // A server older than checks sends neither field: every
                // production it lists is one a scan may go to.
                final language = Localizations.localeOf(context).languageCode;
                final rows =
                    <({String id, String name, String subtitle, bool book, bool check})>[
                          for (final item
                              in items is List<Production> ? _byDate(items) : items)
                            if (item is Location)
                              (
                                id: item.id,
                                name: item.name,
                                subtitle: [
                                  item.organization.shortName ?? item.organization.name,
                                  if (item.address != null)
                                    '${item.address!.postalCode} ${item.address!.city}',
                                ].join(' · '),
                                book: true,
                                check: false,
                              )
                            else if (item is Production)
                              (
                                id: item.id,
                                name: item.name,
                                subtitle: [
                                  item.organization.shortName ?? item.organization.name,
                                  ?_dateRange(item, language),
                                  // Lent to someone else's production: only
                                  // this org's own units go out to it.
                                  if (item.checkoutRole == ProductionCheckoutRole.lender)
                                    l10n.productionCheckLenderOnly,
                                ].join(' · '),
                                book: item.checkoutRole != ProductionCheckoutRole.none,
                                check: item.canCheck ?? false,
                              ),
                        ]
                        .where((r) => r.book || r.check)
                        .where(
                          (r) => _query.isEmpty || r.name.toLowerCase().contains(_query),
                        )
                        .toList();

                if (rows.isEmpty) {
                  return Center(child: Text(l10n.noResults));
                }
                return ListView.separated(
                  itemCount: rows.length,
                  separatorBuilder: (_, _) => const Divider(height: 1),
                  itemBuilder: (_, i) {
                    final row = rows[i];
                    return ListTile(
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 6,
                      ),
                      title: Text(
                        row.name,
                        style: const TextStyle(fontWeight: FontWeight.w600),
                      ),
                      subtitle: row.subtitle.isEmpty ? null : Text(row.subtitle),
                      trailing: const Icon(Icons.chevron_right),
                      onTap: () => _open(row),
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

/// Running first (ending soonest), then upcoming (starting soonest, undated
/// last), then past (most recent first) — the order the web's production
/// picker uses, so this week's job is on top and not last year's of the same
/// name.
List<Production> _byDate(List<Production> productions) {
  final now = DateTime.now();
  final today = DateTime(now.year, now.month, now.day);
  DateTime? day(DateTime? d) {
    if (d == null) return null;
    final local = d.toLocal();
    return DateTime(local.year, local.month, local.day);
  }

  int phase(Production p) {
    final start = day(p.startDate);
    if (start == null) return 1;
    final end = day(p.endDate) ?? start;
    if (end.isBefore(today)) return 2;
    if (start.isAfter(today)) return 1;
    return 0;
  }

  int compareDates(DateTime? a, DateTime? b) {
    if (a == null) return b == null ? 0 : 1;
    if (b == null) return -1;
    return a.compareTo(b);
  }

  return [...productions]..sort((a, b) {
    final pa = phase(a);
    final byPhase = pa.compareTo(phase(b));
    if (byPhase != 0) return byPhase;
    final byDate = switch (pa) {
      0 => compareDates(a.endDate ?? a.startDate, b.endDate ?? b.startDate),
      1 => compareDates(a.startDate, b.startDate),
      _ => compareDates(b.endDate ?? b.startDate, a.endDate ?? a.startDate),
    };
    return byDate != 0 ? byDate : naturalCompare(a.name, b.name);
  });
}

/// "12. Okt. – 14. Okt.", or one date for a single day; null when undated.
String? _dateRange(Production p, String language) {
  final start = p.startDate;
  if (start == null) return null;
  final format = DateFormat.MMMd(language);
  final from = format.format(start.toLocal());
  final end = p.endDate;
  final to = end == null ? null : format.format(end.toLocal());
  return to == null || to == from ? from : '$from – $to';
}

class _StocktakeList extends StatelessWidget {
  const _StocktakeList({
    required this.stocktakes,
    required this.onOpen,
    required this.onNew,
    required this.onCaseCheck,
    required this.onRefresh,
  });

  final List<StocktakeSummary> stocktakes;
  final ValueChanged<StocktakeSummary> onOpen;
  final VoidCallback onNew;

  /// One case rather than a whole stocktake — it lives here because it is
  /// counting too, just of a single box.
  final VoidCallback onCaseCheck;
  final Future<void> Function() onRefresh;

  @override
  Widget build(BuildContext context) {
    final l10n = S.of(context);
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
          child: SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: onNew,
              icon: const Icon(Icons.add),
              label: Text(l10n.stocktakeNew),
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 4),
          child: SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: onCaseCheck,
              icon: const Icon(Icons.inventory_2_outlined),
              label: Text(l10n.caseCheck),
            ),
          ),
        ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: onRefresh,
            child: stocktakes.isEmpty
                ? ListView(
                    children: [
                      Padding(
                        padding: const EdgeInsets.all(32),
                        child: Center(child: Text(l10n.stocktakeNone)),
                      ),
                    ],
                  )
                : ListView.separated(
                    itemCount: stocktakes.length,
                    separatorBuilder: (_, _) => const Divider(height: 1),
                    itemBuilder: (_, i) {
                      final s = stocktakes[i];
                      final p = s.progress;
                      return ListTile(
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: 16,
                          vertical: 6,
                        ),
                        title: Text(
                          s.name,
                          style: const TextStyle(fontWeight: FontWeight.w600),
                        ),
                        subtitle: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              [
                                s.organization.shortName ?? s.organization.name,
                                l10n.stocktakeProgress(p.found, p.expected),
                              ].join(' · '),
                            ),
                            const SizedBox(height: 6),
                            LinearProgressIndicator(
                              value: p.expected == 0 ? 1 : p.found / p.expected,
                            ),
                          ],
                        ),
                        trailing: const Icon(Icons.chevron_right),
                        onTap: () => onOpen(s),
                      );
                    },
                  ),
          ),
        ),
      ],
    );
  }
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final l10n = S.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(message, textAlign: TextAlign.center),
            const SizedBox(height: 16),
            OutlinedButton(onPressed: onRetry, child: Text(l10n.retry)),
          ],
        ),
      ),
    );
  }
}

class _SegmentLabel extends StatelessWidget {
  const _SegmentLabel(this.icon, this.text);

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 20),
        const SizedBox(height: 2),
        Text(
          text,
          maxLines: 1,
          softWrap: false,
          overflow: TextOverflow.fade,
        ),
      ],
    );
  }
}
