import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/client.dart';
import '../api/generated/export.dart';
import '../l10n/generated/app_localizations.dart';
import '../state/providers.dart';
import 'session_screen.dart';
import 'stocktake_new_screen.dart';
import 'stocktake_screen.dart';

/// The three things a batch of scans can go to. The first two book equipment;
/// a stocktake only counts it.
enum _Mode { location, production, stocktake }

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

  void _start(String id, String name) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => SessionScreen(
          targetType: _mode == _Mode.production
              ? ScanRequestTargetType.production
              : ScanRequestTargetType.location,
          targetId: id,
          targetName: name,
        ),
      ),
    );
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
                    onRefresh: () => ref.refresh(openStocktakesProvider.future),
                  );
                }
                final rows =
                    <({String id, String name, String subtitle})>[
                          for (final item in items)
                            if (item is Location)
                              (
                                id: item.id,
                                name: item.name,
                                subtitle: [
                                  item.organization.shortName ?? item.organization.name,
                                  if (item.address != null)
                                    '${item.address!.postalCode} ${item.address!.city}',
                                ].join(' · '),
                              )
                            else if (item is Production)
                              (
                                id: item.id,
                                name: item.name,
                                subtitle:
                                    item.organization.shortName ?? item.organization.name,
                              ),
                        ]
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
                      onTap: () => _start(row.id, row.name),
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

class _StocktakeList extends StatelessWidget {
  const _StocktakeList({
    required this.stocktakes,
    required this.onOpen,
    required this.onNew,
    required this.onRefresh,
  });

  final List<StocktakeSummary> stocktakes;
  final ValueChanged<StocktakeSummary> onOpen;
  final VoidCallback onNew;
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
