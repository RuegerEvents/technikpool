import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/client.dart';
import '../api/generated/export.dart';
import '../l10n/generated/app_localizations.dart';
import '../state/providers.dart';
import 'session_screen.dart';

/// Pick what the next batch of scans books against, mirroring the web app's
/// /checkout setup step.
class SessionSetupScreen extends ConsumerStatefulWidget {
  const SessionSetupScreen({super.key});

  @override
  ConsumerState<SessionSetupScreen> createState() => _SessionSetupScreenState();
}

class _SessionSetupScreenState extends ConsumerState<SessionSetupScreen> {
  ScanRequestTargetType _type = ScanRequestTargetType.location;
  String _query = '';

  void _start(String id, String name) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => SessionScreen(targetType: _type, targetId: id, targetName: name),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = S.of(context);
    final isLocation = _type == ScanRequestTargetType.location;
    final async = isLocation
        ? ref.watch(locationsProvider)
        : ref.watch(productionsProvider);

    return Scaffold(
      // HomeScreen's Scaffold owns the keyboard inset for every tab.
      resizeToAvoidBottomInset: false,
      appBar: AppBar(title: Text(l10n.startSession)),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: SegmentedButton<ScanRequestTargetType>(
              segments: [
                ButtonSegment(
                  value: ScanRequestTargetType.location,
                  label: Text(l10n.location),
                  icon: Icon(Icons.warehouse_outlined),
                ),
                ButtonSegment(
                  value: ScanRequestTargetType.production,
                  label: Text(l10n.production),
                  icon: Icon(Icons.event_outlined),
                ),
              ],
              selected: {_type},
              onSelectionChanged: (s) => setState(() => _type = s.first),
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
                onRetry: () =>
                    ref.invalidate(isLocation ? locationsProvider : productionsProvider),
              ),
              data: (items) {
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
