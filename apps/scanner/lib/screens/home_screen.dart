import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/client.dart';
import '../l10n/generated/app_localizations.dart';
import '../state/providers.dart';
import 'inventory_screen.dart';
import 'lookup_screen.dart';
import 'session_setup_screen.dart';
import 'settings_screen.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  static const _tabs = [
    SessionSetupScreen(),
    LookupScreen(),
    InventoryScreen(),
    SettingsScreen(),
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = S.of(context);
    // A 401 means the token was revoked or expired; drop it and the root widget
    // swaps back to pairing. Checked against the typed status rather than the
    // message, which is localised and would never have matched.
    ref.listen(currentUserProvider, (_, next) {
      next.whenOrNull(
        error: (error, _) {
          final err = unwrapError(error);
          if (err is ApiException && err.isUnauthorized) {
            ref.read(credentialsProvider.notifier).signOut();
          }
        },
      );
    });

    final tab = ref.watch(activeTabProvider);

    return Scaffold(
      body: IndexedStack(index: tab.index, children: _tabs),
      bottomNavigationBar: NavigationBar(
        selectedIndex: tab.index,
        onDestinationSelected: (i) =>
            ref.read(activeTabProvider.notifier).select(HomeTab.values[i]),
        destinations: [
          NavigationDestination(icon: Icon(Icons.qr_code_scanner), label: l10n.scansLabel),
          NavigationDestination(icon: Icon(Icons.search), label: l10n.lookup),
          NavigationDestination(
            icon: Icon(Icons.inventory_2_outlined),
            label: l10n.inventory,
          ),
          NavigationDestination(icon: Icon(Icons.settings_outlined), label: l10n.settings),
        ],
      ),
    );
  }
}
