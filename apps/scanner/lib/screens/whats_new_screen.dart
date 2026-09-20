import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../changelog.dart';
import '../l10n/generated/app_localizations.dart';

/// What each version of the app brought, newest first. Reached from Settings.
///
/// The warehouse updates through the stores, so a handheld can be several
/// versions behind the one someone else is holding — which is exactly when
/// "it does that on mine" needs an answer.
///
/// Marking the newest release seen is the job of whatever opened this — the
/// home banner and the Settings row both do it — so that this screen stays a
/// pure read and can be pumped in a test without a storage plugin behind it.
class WhatsNewScreen extends ConsumerWidget {
  const WhatsNewScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = S.of(context);
    final language = Localizations.localeOf(context).languageCode;
    final changelog = ref.watch(changelogProvider);

    return Scaffold(
      appBar: AppBar(title: Text(l10n.whatsNew)),
      body: changelog.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Text('$error'),
          ),
        ),
        data: (releases) => ListView.separated(
          itemCount: releases.length,
          separatorBuilder: (_, _) => const Divider(height: 1),
          itemBuilder: (_, i) => _ReleaseTile(releases[i], language: language),
        ),
      ),
    );
  }
}

class _ReleaseTile extends StatelessWidget {
  const _ReleaseTile(this.release, {required this.language});

  final Release release;
  final String language;

  @override
  Widget build(BuildContext context) {
    final l10n = S.of(context);
    final scheme = Theme.of(context).colorScheme;

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            l10n.versionLabel(release.version),
            style: TextStyle(
              fontWeight: FontWeight.w600,
              color: scheme.primary,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            DateFormat.yMMMMd(language).format(release.date),
            style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant),
          ),
          const SizedBox(height: 12),
          for (final note in release.notesFor(language))
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('•  ', style: TextStyle(color: scheme.onSurfaceVariant)),
                  Expanded(child: Text(note)),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
