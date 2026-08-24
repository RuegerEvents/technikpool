import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/client.dart';
import '../api/generated/export.dart';
import '../l10n/strings.dart';
import '../state/providers.dart';
import '../widgets/category_pill.dart';

/// Browse what's where, without scanning anything.
class InventoryScreen extends ConsumerStatefulWidget {
  const InventoryScreen({super.key});

  @override
  ConsumerState<InventoryScreen> createState() => _InventoryScreenState();
}

class _InventoryScreenState extends ConsumerState<InventoryScreen> {
  final _assets = <Asset>[];
  String? _locationId;
  String? _categoryId;
  String _query = '';
  String? _cursor;
  bool _loading = false;
  bool _exhausted = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load(reset: true));
  }

  Future<void> _load({bool reset = false}) async {
    if (_loading) return;
    final api = ref.read(apiClientProvider);
    if (api == null) return;

    setState(() {
      _loading = true;
      _error = null;
      if (reset) {
        _assets.clear();
        _cursor = null;
        _exhausted = false;
      }
    });

    try {
      final page = await api.inventory.listAssets(
        limit: 50,
        locationId: _locationId,
        categoryId: _categoryId,
        q: _query.isEmpty ? null : _query,
        cursor: _cursor,
      );
      if (!mounted) return;
      setState(() {
        _assets.addAll(page.items);
        _cursor = page.nextCursor;
        _exhausted = page.nextCursor == null;
      });
    } catch (error) {
      if (mounted) setState(() => _error = describeError(error));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final locations = ref.watch(locationsProvider).value ?? const <Location>[];
    final categories = ref.watch(categoriesProvider).value ?? const <Category>[];

    return Scaffold(
      appBar: AppBar(title: const Text(S.inventory)),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
            child: TextField(
              decoration: const InputDecoration(
                labelText: S.search,
                prefixIcon: Icon(Icons.search),
                isDense: true,
              ),
              textInputAction: TextInputAction.search,
              onSubmitted: (v) {
                _query = v.trim();
                _load(reset: true);
              },
            ),
          ),
          // Side by side rather than stacked: a third full-width row would eat
          // most of a PDA screen before a single result showed.
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
            child: Row(
              spacing: 8,
              children: [
                Expanded(
                  child: DropdownButtonFormField<String?>(
                    initialValue: _locationId,
                    isExpanded: true,
                    decoration: const InputDecoration(
                      labelText: S.filterByLocation,
                      isDense: true,
                    ),
                    items: [
                      const DropdownMenuItem(value: null, child: Text(S.all)),
                      for (final loc in locations)
                        DropdownMenuItem(
                          value: loc.id,
                          child: Text(loc.name, overflow: TextOverflow.ellipsis),
                        ),
                    ],
                    onChanged: (v) {
                      _locationId = v;
                      _load(reset: true);
                    },
                  ),
                ),
                Expanded(
                  child: DropdownButtonFormField<String?>(
                    initialValue: _categoryId,
                    isExpanded: true,
                    decoration: const InputDecoration(
                      labelText: S.filterByCategory,
                      isDense: true,
                    ),
                    items: [
                      const DropdownMenuItem(value: null, child: Text(S.all)),
                      for (final category in categories)
                        DropdownMenuItem(
                          value: category.id,
                          child: Text(category.name, overflow: TextOverflow.ellipsis),
                        ),
                    ],
                    onChanged: (v) {
                      _categoryId = v;
                      _load(reset: true);
                    },
                  ),
                ),
              ],
            ),
          ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.all(16),
              child: Text(
                _error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () => _load(reset: true),
              child: ListView.separated(
                itemCount: _assets.length + 1,
                separatorBuilder: (_, _) => const Divider(height: 1),
                itemBuilder: (_, i) {
                  if (i == _assets.length) {
                    if (_loading) {
                      return const Padding(
                        padding: EdgeInsets.all(24),
                        child: Center(child: CircularProgressIndicator()),
                      );
                    }
                    if (_exhausted) return const SizedBox(height: 24);
                    return Padding(
                      padding: const EdgeInsets.all(16),
                      child: OutlinedButton(
                        onPressed: _load,
                        child: const Text(S.loadMore),
                      ),
                    );
                  }
                  final asset = _assets[i];
                  return ListTile(
                    title: Text(
                      '${asset.product.manufacturerName} ${asset.product.name}',
                      style: const TextStyle(fontWeight: FontWeight.w600),
                    ),
                    subtitle: Padding(
                      padding: const EdgeInsets.only(top: 3),
                      child: Row(
                        spacing: 8,
                        children: [
                          CategoryPill(asset.product.category, dense: true),
                          Expanded(
                            child: Text(
                              [asset.assetTag ?? '—', asset.location.name].join(' · '),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }
}
