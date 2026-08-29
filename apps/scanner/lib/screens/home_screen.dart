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
    final demo = ref.watch(isDemoProvider);

    Widget tabs = IndexedStack(index: tab.index, children: _tabs);
    // The banner has already spent the status-bar inset getting out from under
    // it. Without this the tab's own AppBar spends it a second time and opens a
    // status bar's worth of blank space between the two.
    if (demo) {
      tabs = MediaQuery.removePadding(context: context, removeTop: true, child: tabs);
    }

    // Each tab has a Scaffold of its own, and every one of them sets
    // resizeToAvoidBottomInset: false, because this one already lifts its body
    // clear of the keyboard. Letting both resize subtracts the keyboard twice —
    // on Android the window itself shrinks, so the second subtraction finds
    // nothing left to take, but on iOS it squeezes a tab into a sliver.
    return Scaffold(
      body: Column(
        children: [
          // A demo that doesn't say so is just an app full of made-up stock.
          // Above the tabs rather than inside one, because every tab is demo
          // data and the reviewer may start on any of them.
          if (demo) _DemoBanner(),
          Expanded(child: tabs),
        ],
      ),
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

/// Says, on every screen, that none of this is real.
class _DemoBanner extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final l10n = S.of(context);
    final scheme = Theme.of(context).colorScheme;
    return Material(
      color: scheme.surfaceContainerHighest,
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: Row(
            children: [
              Icon(Icons.science_outlined, size: 18, color: scheme.onSurfaceVariant),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  l10n.demoBannerText,
                  style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
