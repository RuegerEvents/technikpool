import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/client.dart';
import '../l10n/strings.dart';
import '../state/providers.dart';
import 'inventory_screen.dart';
import 'lookup_screen.dart';
import 'session_setup_screen.dart';
import 'settings_screen.dart';

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  int _tab = 0;

  static const _tabs = [
    SessionSetupScreen(),
    LookupScreen(),
    InventoryScreen(),
    SettingsScreen(),
  ];

  @override
  Widget build(BuildContext context) {
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

    return Scaffold(
      body: IndexedStack(index: _tab, children: _tabs),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.qr_code_scanner), label: S.scansLabel),
          NavigationDestination(icon: Icon(Icons.search), label: S.lookup),
          NavigationDestination(
            icon: Icon(Icons.inventory_2_outlined),
            label: S.inventory,
          ),
          NavigationDestination(icon: Icon(Icons.settings_outlined), label: S.settings),
        ],
      ),
    );
  }
}
