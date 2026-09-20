import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/client.dart';
import '../changelog.dart';
import '../l10n/generated/app_localizations.dart';
import '../state/providers.dart';
import 'inventory_screen.dart';
import 'lookup_screen.dart';
import 'session_setup_screen.dart';
import 'settings_screen.dart';
import 'whats_new_screen.dart';

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
    final unseen = ref.watch(unseenReleaseProvider);
    final banners = demo || unseen != null;

    Widget tabs = IndexedStack(index: tab.index, children: _tabs);
    // The banners have already spent the status-bar inset getting out from
    // under it. Without this the tab's own AppBar spends it a second time and
    // opens a status bar's worth of blank space between the two.
    if (banners) {
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
          // One SafeArea for both: each banner reads the same ambient
          // MediaQuery, so a SafeArea of its own would make the second one
          // spend the status-bar inset a second time.
          if (banners)
            SafeArea(
              bottom: false,
              child: Column(
                children: [
                  // A demo that doesn't say so is just an app full of made-up
                  // stock. Above the tabs rather than inside one, because every
                  // tab is demo data and the reviewer may start on any of them.
                  if (demo) _DemoBanner(),
                  if (unseen != null) _WhatsNewBanner(unseen),
                ],
              ),
            ),
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
///
/// The status-bar inset is spent by the shared SafeArea in [HomeScreen], not
/// here, so that this and the What's new banner can stack.
class _DemoBanner extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final l10n = S.of(context);
    final scheme = Theme.of(context).colorScheme;
    return Material(
      color: scheme.surfaceContainerHighest,
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
    );
  }
}

/// Says the app has been updated, and opens the changelog. Dismissible, and
/// gone for good once the version it names has been seen — a handheld that
/// nobody updates should not carry a permanent notice.
class _WhatsNewBanner extends ConsumerWidget {
  const _WhatsNewBanner(this.release);

  final Release release;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = S.of(context);
    final scheme = Theme.of(context).colorScheme;

    void markSeen() => ref.read(seenVersionProvider.notifier).save(release.version);

    return Material(
      color: scheme.secondaryContainer,
      child: InkWell(
        onTap: () {
          markSeen();
          Navigator.of(context)
              .push(MaterialPageRoute<void>(builder: (_) => const WhatsNewScreen()));
        },
        child: Padding(
          padding: const EdgeInsets.only(left: 16, right: 4),
          child: Row(
            children: [
              Icon(
                Icons.auto_awesome_outlined,
                size: 18,
                color: scheme.onSecondaryContainer,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  l10n.whatsNewIn(release.version),
                  style: TextStyle(fontSize: 12, color: scheme.onSecondaryContainer),
                ),
              ),
              IconButton(
                icon: const Icon(Icons.close, size: 18),
                color: scheme.onSecondaryContainer,
                tooltip: l10n.dismiss,
                onPressed: markSeen,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
