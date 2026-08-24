import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../l10n/generated/app_localizations.dart';
import '../scan/scan_channel.dart';
import '../scan/scan_settings.dart';
import '../state/providers.dart';
import 'diagnostics_screen.dart';

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = S.of(context);
    final creds = ref.watch(credentialsProvider).value;
    final user = ref.watch(currentUserProvider);
    final config = ref.watch(scannerConfigProvider).value;
    final settings = ref.watch(scanSettingsProvider);

    return Scaffold(
      appBar: AppBar(title: Text(l10n.settings)),
      body: ListView(
        children: [
          ListTile(
            title: Text(l10n.connectedAs),
            subtitle: Text(
              user.when(
                data: (u) =>
                    '${u.user.name ?? u.user.email} · '
                    '${u.organizations.map((o) => o.shortName ?? o.name).join(', ')}',
                loading: () => '…',
                error: (e, _) => '$e',
              ),
            ),
          ),
          ListTile(title: Text(l10n.server), subtitle: Text(creds?.baseUrl ?? '—')),
          const Divider(),
          _SectionHeader(l10n.language),
          RadioGroup<Locale?>(
            groupValue: ref.watch(localeProvider).value,
            onChanged: (picked) => ref.read(localeProvider.notifier).save(picked),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                RadioListTile<Locale?>(value: null, title: Text(l10n.languageSystem)),
                // Endonyms on purpose: someone hunting for their own language
                // scans for the word they would write, not its translation.
                for (final locale in S.supportedLocales)
                  RadioListTile<Locale?>(
                    value: locale,
                    title: Text(switch (locale.languageCode) {
                      'de' => 'Deutsch',
                      'en' => 'English',
                      _ => locale.languageCode,
                    }),
                  ),
              ],
            ),
          ),
          const Divider(),
          _SectionHeader(l10n.scanInput),
          RadioGroup<ScanMode>(
            groupValue: settings.mode,
            onChanged: (picked) {
              if (picked != null) ref.read(scanModeProvider.notifier).save(picked);
            },
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                for (final mode in ScanMode.values)
                  RadioListTile<ScanMode>(
                    value: mode,
                    title: Text(switch (mode) {
                      ScanMode.auto => l10n.scanModeAuto,
                      ScanMode.hardware => l10n.scanModeHardware,
                      ScanMode.camera => l10n.scanModeCamera,
                    }),
                    subtitle: Text(switch (mode) {
                      ScanMode.auto => l10n.scanModeAutoHint,
                      ScanMode.hardware => l10n.scanModeHardwareHint,
                      ScanMode.camera => l10n.scanModeCameraHint,
                    }),
                    // A device with no broadcast bridge cannot honour either of
                    // the hardware answers, so it is not offered them.
                    enabled: ScanChannel.isSupported || mode == ScanMode.camera,
                  ),
              ],
            ),
          ),
          if (ScanChannel.isSupported)
            ListTile(
              leading: Icon(
                settings.hardwareSeen || settings.isKnownPda
                    ? Icons.check_circle_outline
                    : Icons.help_outline,
              ),
              title: Text(switch (settings) {
                ScanSettings(hardwareSeen: true) => l10n.hardwareDetected,
                ScanSettings(isKnownPda: true) => l10n.knownPdaModel,
                _ => l10n.hardwareNotDetected,
              }),
              subtitle: Text(settings.device?.toString() ?? '…'),
              trailing: settings.hardwareSeen
                  ? TextButton(
                      onPressed: () => ref.read(hardwareSeenProvider.notifier).forget(),
                      child: Text(l10n.reset),
                    )
                  : null,
            ),
          // Both of these configure the Android broadcast bridge, which does
          // not exist on a device that scans with its camera.
          if (ScanChannel.isSupported) ...[
            const Divider(),
            ListTile(
              title: Text(l10n.scannerConfig),
              subtitle: Text(
                config == null
                    ? '…'
                    : '${config.actions.length} Actions · ${config.extraKeys.length} Keys',
              ),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => Navigator.of(
                context,
              ).push(MaterialPageRoute<void>(builder: (_) => const _ScannerConfigScreen())),
            ),
            ListTile(
              title: Text(l10n.diagnostics),
              subtitle: Text(l10n.diagnosticsHint),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => Navigator.of(context)
                  .push(MaterialPageRoute<void>(builder: (_) => const DiagnosticsScreen())),
            ),
          ],
          const Divider(),
          Padding(
            padding: const EdgeInsets.all(16),
            child: OutlinedButton.icon(
              icon: const Icon(Icons.logout),
              label: Text(l10n.disconnect),
              onPressed: () => ref.read(credentialsProvider.notifier).signOut(),
            ),
          ),
        ],
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader(this.label);

  final String label;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
    child: Text(
      label,
      style: TextStyle(
        fontWeight: FontWeight.w600,
        color: Theme.of(context).colorScheme.primary,
      ),
    ),
  );
}

class _ScannerConfigScreen extends ConsumerStatefulWidget {
  const _ScannerConfigScreen();

  @override
  ConsumerState<_ScannerConfigScreen> createState() => _ScannerConfigScreenState();
}

class _ScannerConfigScreenState extends ConsumerState<_ScannerConfigScreen> {
  late final TextEditingController _actions;
  late final TextEditingController _keys;

  @override
  void initState() {
    super.initState();
    final config = ref.read(scannerConfigProvider).value ?? ScannerConfig.defaults;
    _actions = TextEditingController(text: config.actions.join(', '));
    _keys = TextEditingController(text: config.extraKeys.join(', '));
  }

  @override
  void dispose() {
    _actions.dispose();
    _keys.dispose();
    super.dispose();
  }

  List<String> _split(String value) =>
      value.split(',').map((s) => s.trim()).where((s) => s.isNotEmpty).toList();

  Future<void> _save() async {
    final l10n = S.of(context);
    await ref
        .read(scannerConfigProvider.notifier)
        .save(ScannerConfig(actions: _split(_actions.text), extraKeys: _split(_keys.text)));
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l10n.saved)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = S.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(l10n.scannerConfig)),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(l10n.configHint),
          const SizedBox(height: 20),
          TextField(
            controller: _actions,
            maxLines: 4,
            decoration: InputDecoration(labelText: l10n.broadcastActions),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _keys,
            maxLines: 3,
            decoration: InputDecoration(labelText: l10n.extraKeys),
          ),
          const SizedBox(height: 24),
          FilledButton(onPressed: _save, child: Text(l10n.save)),
        ],
      ),
    );
  }
}
