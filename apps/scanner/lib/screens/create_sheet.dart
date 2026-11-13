import 'package:flutter/material.dart';

import '../l10n/generated/app_localizations.dart';
import 'bundle_new_screen.dart';
import 'device_new_screen.dart';

/// One thing the "+" on the home screen can make.
class _CreateEntry {
  const _CreateEntry({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.screen,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final Widget Function() screen;
}

/// "Create new": the list behind the home screen's "+". Each entry opens a
/// screen of its own; a new kind of thing to make (a device, cables …) is one
/// more entry in [_entries], nothing else.
Future<void> showCreateSheet(BuildContext context) async {
  final l10n = S.of(context);
  final entries = _entries(l10n);
  final picked = await showModalBottomSheet<_CreateEntry>(
    context: context,
    showDragHandle: true,
    builder: (sheetContext) => SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(24, 0, 24, 8),
            child: Text(
              l10n.createNew,
              style: Theme.of(sheetContext).textTheme.titleMedium,
            ),
          ),
          for (final entry in entries)
            ListTile(
              contentPadding: const EdgeInsets.symmetric(horizontal: 24, vertical: 4),
              leading: Icon(entry.icon),
              title: Text(entry.title),
              subtitle: Text(entry.subtitle),
              onTap: () => Navigator.of(sheetContext).pop(entry),
            ),
          const SizedBox(height: 8),
        ],
      ),
    ),
  );
  if (picked == null || !context.mounted) return;
  await Navigator.of(context)
      .push<void>(MaterialPageRoute(builder: (_) => picked.screen()));
}

List<_CreateEntry> _entries(S l10n) => [
  _CreateEntry(
    icon: Icons.inventory_2_outlined,
    title: l10n.bundleNew,
    subtitle: l10n.bundleNewHint,
    screen: () => const BundleNewScreen(),
  ),
  _CreateEntry(
    icon: Icons.add_box_outlined,
    title: l10n.deviceNew,
    subtitle: l10n.deviceNewHint,
    screen: () => const DeviceNewScreen(),
  ),
];
