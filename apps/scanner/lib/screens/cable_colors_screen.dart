import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/generated/export.dart';
import '../cable_colors.dart';
import '../cable_format.dart';
import '../l10n/generated/app_localizations.dart';
import '../l10n/labels.dart';
import '../natural_sort.dart';
import '../state/providers.dart';
import '../widgets/cable_color_dot.dart';

/// The legend: which colour of tape marks which length, per organization.
/// Read-only — schemes are kept on the web, by an org's admins.
///
/// From Settings it lists every scheme the user sees; from a production's
/// list only those of the organizations on it ([organizationIds]).
class CableColorsScreen extends ConsumerWidget {
  const CableColorsScreen({
    super.key,
    this.organizationIds,
    this.names = const {},
  });

  /// Only these organizations' schemes, or every one when null.
  final Set<String>? organizationIds;

  /// Names the caller knows that the user's memberships may not — a lending
  /// org's, as a production's list names it.
  final Map<String, String> names;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = S.of(context);
    final theme = Theme.of(context);
    final muted = theme.colorScheme.onSurfaceVariant;
    final async = ref.watch(cableColorsProvider);
    final colors = async.value ?? CableColors.empty;
    final orgNames = <String, String>{
      for (final p
          in ref.watch(productionsProvider).value ?? const <Production>[])
        p.organization.id: p.organization.name,
      for (final o
          in ref.watch(currentUserProvider).value?.organizations ??
              const <MemberOrganization>[])
        o.id: o.name,
      ...names,
    };
    String nameOf(String id) => orgNames[id] ?? l10n.cableColorsOtherOrg;
    final ids =
        colors.organizationIds
            .where((id) => organizationIds?.contains(id) ?? true)
            .toList()
          ..sort((a, b) => naturalCompare(nameOf(a), nameOf(b)));

    return Scaffold(
      appBar: AppBar(title: Text(l10n.cableColors)),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(cableColorsProvider);
          await ref.read(cableColorsProvider.future);
        },
        child: ListView(
          padding: const EdgeInsets.only(bottom: 24),
          children: [
            if (async.isLoading && !async.hasValue)
              const Padding(
                padding: EdgeInsets.all(24),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (ids.isEmpty)
              Padding(
                padding: const EdgeInsets.all(24),
                child: Text(
                  l10n.cableColorsEmpty,
                  textAlign: TextAlign.center,
                  style: TextStyle(color: muted),
                ),
              ),
            for (final id in ids) ...[
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
                child: Text(nameOf(id), style: theme.textTheme.titleSmall),
              ),
              ..._bands(l10n, colors.bandsOf(id), muted),
              const Divider(),
            ],
          ],
        ),
      ),
    );
  }

  List<Widget> _bands(S l10n, List<CableColorBand> bands, Color muted) {
    final locale = l10n.localeName;
    return [
      for (var i = 0; i < bands.length; i++)
        ListTile(
          dense: true,
          leading: ExcludeSemantics(
            child: CableColorDot(CableColor.of(bands[i]), size: 18),
          ),
          title: Text(Labels.cableColor(l10n, CableColor.of(bands[i]))),
          trailing: Text(
            i == 0
                ? l10n.cableColorUpTo(
                    '${metres(bands[i].maxLengthCm, locale)} m',
                  )
                : l10n.cableColorRange(
                    metres(bands[i - 1].maxLengthCm, locale),
                    '${metres(bands[i].maxLengthCm, locale)} m',
                  ),
            style: const TextStyle(fontWeight: FontWeight.w500),
          ),
        ),
      if (bands.isNotEmpty)
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 0),
          child: Text(
            l10n.cableColorsLonger(
              '${metres(bands.last.maxLengthCm, locale)} m',
            ),
            style: TextStyle(color: muted, fontSize: 12),
          ),
        ),
    ];
  }
}
