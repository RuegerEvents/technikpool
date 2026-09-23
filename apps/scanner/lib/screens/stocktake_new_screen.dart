import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/client.dart';
import '../api/generated/export.dart';
import '../l10n/generated/app_localizations.dart';
import '../state/providers.dart';
import '../theme.dart';

/// Start a stocktake from the warehouse floor: an organization, and optionally
/// some of its locations and some categories. Scoping by product stays on the
/// web — a handheld is the wrong place to pick from the whole catalogue.
///
/// Pops with the created [StocktakeSummary], so the caller can go straight on
/// to counting.
class StocktakeNewScreen extends ConsumerStatefulWidget {
  const StocktakeNewScreen({super.key});

  @override
  ConsumerState<StocktakeNewScreen> createState() => _StocktakeNewScreenState();
}

class _StocktakeNewScreenState extends ConsumerState<StocktakeNewScreen> {
  final _name = TextEditingController();
  String? _orgId;
  final _locationIds = <String>{};
  final _categoryIds = <String>{};

  StocktakePreview? _preview;
  Object? _previewError;
  bool _starting = false;

  /// Only the newest preview may land: selections change faster than the round
  /// trip, and an older answer arriving last would describe the wrong scope.
  int _previewSeq = 0;
  Timer? _debounce;

  @override
  void dispose() {
    _debounce?.cancel();
    _name.dispose();
    super.dispose();
  }

  /// MEMBER is the rung that may count; below it the server refuses to start.
  static bool _canCount(MemberOrganization org, bool isAdmin) {
    if (isAdmin) return true;
    return switch (org.role) {
      MemberOrganizationRole.member ||
      MemberOrganizationRole.admin ||
      MemberOrganizationRole.owner => true,
      _ => false,
    };
  }

  void _changed() {
    setState(() {});
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 300), _loadPreview);
  }

  Future<void> _loadPreview() async {
    final orgId = _orgId;
    final api = ref.read(apiClientProvider);
    if (orgId == null || api == null) return;
    final seq = ++_previewSeq;
    try {
      final preview = await api.stocktake.previewStocktake(
        body: StocktakeScopeRequest(
          organizationId: orgId,
          locationIds: _locationIds.toList(),
          categoryIds: _categoryIds.toList(),
        ),
      );
      if (!mounted || seq != _previewSeq) return;
      setState(() {
        _preview = preview;
        _previewError = null;
      });
    } catch (error) {
      if (!mounted || seq != _previewSeq) return;
      setState(() {
        _preview = null;
        _previewError = error;
      });
    }
  }

  bool get _hasAnything {
    final p = _preview;
    return p != null && p.units + p.looseUnits + p.out > 0;
  }

  String _defaultName(List<Location> locations) {
    final l10n = S.of(context);
    final date = MaterialLocalizations.of(context).formatCompactDate(DateTime.now());
    final names = locations.where((l) => _locationIds.contains(l.id)).map((l) => l.name);
    final base = l10n.stocktakeDefaultName(date);
    return names.isEmpty ? base : '$base – ${names.join(', ')}';
  }

  Future<void> _start(List<Location> locations) async {
    final orgId = _orgId;
    final api = ref.read(apiClientProvider);
    if (orgId == null || api == null) return;
    // Read before the await — see SessionScreen._submit.
    final l10n = S.of(context);
    final messenger = ScaffoldMessenger.of(context);
    final name = _name.text.trim().isEmpty ? _defaultName(locations) : _name.text.trim();

    setState(() => _starting = true);
    try {
      final created = await api.stocktake.createStocktake(
        body: StocktakeCreateRequest(
          organizationId: orgId,
          name: name,
          locationIds: _locationIds.toList(),
          categoryIds: _categoryIds.toList(),
        ),
      );
      if (mounted) Navigator.of(context).pop(created);
    } catch (error) {
      messenger.showSnackBar(SnackBar(content: Text(describeError(l10n, error))));
      if (mounted) setState(() => _starting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = S.of(context);
    final me = ref.watch(currentUserProvider);
    final locationsAsync = ref.watch(locationsProvider);
    final categoriesAsync = ref.watch(categoriesProvider);

    return Scaffold(
      appBar: AppBar(title: Text(l10n.stocktakeNew)),
      body: me.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(child: Text(describeError(l10n, error))),
        data: (user) {
          final orgs = user.organizations.where((o) => _canCount(o, user.isAdmin)).toList();
          if (orgs.isEmpty) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Text(l10n.stocktakeNoOrgs, textAlign: TextAlign.center),
              ),
            );
          }
          if (_orgId == null || !orgs.any((o) => o.id == _orgId)) {
            _orgId = orgs.first.id;
            WidgetsBinding.instance.addPostFrameCallback((_) => _loadPreview());
          }
          final locations = (locationsAsync.value ?? const <Location>[])
              .where((l) => l.organization.id == _orgId)
              .toList();
          final categories = categoriesAsync.value ?? const <Category>[];

          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              if (orgs.length > 1) ...[
                DropdownButtonFormField<String>(
                  initialValue: _orgId,
                  decoration: InputDecoration(labelText: l10n.stocktakeOrganization),
                  items: [
                    for (final org in orgs)
                      DropdownMenuItem(value: org.id, child: Text(org.name)),
                  ],
                  onChanged: (id) {
                    _orgId = id;
                    // Locations belong to one org; a pick from another means nothing.
                    _locationIds.clear();
                    _changed();
                  },
                ),
                const SizedBox(height: 20),
              ],
              _SectionLabel(l10n.stocktakeLocations, l10n.stocktakeNoneMeansAll),
              Wrap(
                spacing: 8,
                runSpacing: 4,
                children: [
                  for (final location in locations)
                    FilterChip(
                      label: Text(location.name),
                      selected: _locationIds.contains(location.id),
                      onSelected: (on) {
                        on
                            ? _locationIds.add(location.id)
                            : _locationIds.remove(location.id);
                        _changed();
                      },
                    ),
                ],
              ),
              const SizedBox(height: 20),
              _SectionLabel(l10n.stocktakeCategories, l10n.stocktakeNoneMeansAll),
              Wrap(
                spacing: 8,
                runSpacing: 4,
                children: [
                  for (final category in categories)
                    FilterChip(
                      label: Text(category.name),
                      selected: _categoryIds.contains(category.id),
                      onSelected: (on) {
                        on
                            ? _categoryIds.add(category.id)
                            : _categoryIds.remove(category.id);
                        _changed();
                      },
                    ),
                ],
              ),
              const SizedBox(height: 20),
              TextField(
                controller: _name,
                decoration: InputDecoration(
                  labelText: l10n.stocktakeName,
                  hintText: _defaultName(locations),
                ),
              ),
              const SizedBox(height: 20),
              _PreviewCard(preview: _preview, error: _previewError),
              const SizedBox(height: 20),
              FilledButton.icon(
                onPressed: _starting || !_hasAnything ? null : () => _start(locations),
                icon: const Icon(Icons.fact_check_outlined),
                label: Text(l10n.stocktakeStart),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.label, this.hint);

  final String label;
  final String hint;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.baseline,
        textBaseline: TextBaseline.alphabetic,
        children: [
          Text(label, style: theme.textTheme.titleSmall),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              hint,
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _PreviewCard extends StatelessWidget {
  const _PreviewCard({required this.preview, required this.error});

  final StocktakePreview? preview;
  final Object? error;

  @override
  Widget build(BuildContext context) {
    final l10n = S.of(context);
    final scheme = Theme.of(context).colorScheme;
    final warning = StatusColors.of(context).warning;
    final p = preview;
    if (error != null) {
      return Text(describeError(l10n, error!), style: TextStyle(color: scheme.error));
    }
    if (p == null) return const LinearProgressIndicator();
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(l10n.stocktakePreview(p.units, p.looseUnits, p.out)),
            for (final overlap in p.overlaps) ...[
              const SizedBox(height: 8),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(Icons.warning_amber_rounded, size: 20, color: warning),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(l10n.stocktakeOverlap(overlap.name, overlap.sharedUnits)),
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
