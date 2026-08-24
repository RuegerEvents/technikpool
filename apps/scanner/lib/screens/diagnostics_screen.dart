import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../l10n/generated/app_localizations.dart';
import '../scan/scan_channel.dart';
import '../state/providers.dart';

/// Listens on a deliberately wide set of actions and shows every broadcast that
/// arrives, with all its extras.
///
/// This exists because the correct action string and extra key genuinely can't
/// be known ahead of time — they vary between PDA vendors and between firmware
/// revisions of one model. Rather than guess, pull the trigger here and read
/// the real values off the device.
class DiagnosticsScreen extends ConsumerStatefulWidget {
  const DiagnosticsScreen({super.key});

  @override
  ConsumerState<DiagnosticsScreen> createState() => _DiagnosticsScreenState();
}

class _DiagnosticsScreenState extends ConsumerState<DiagnosticsScreen> {
  final _events = <DiagnosticEvent>[];
  StreamSubscription<DiagnosticEvent>? _sub;
  ScannerConfig? _restore;

  @override
  void initState() {
    super.initState();
    _sub = ref.read(scanChannelProvider).diagnostics.listen((event) {
      if (mounted) setState(() => _events.insert(0, event));
    });
    unawaited(_listenWidely());
  }

  /// Temporarily register for every action we've ever seen a PDA use, plus the
  /// ones already configured, so the net is as wide as possible.
  Future<void> _listenWidely() async {
    final current = ref.read(scannerConfigProvider).value ?? ScannerConfig.defaults;
    _restore = current;
    final wide = {...ScannerConfig.defaults.actions, ...current.actions}.toList();
    await ref
        .read(scanChannelProvider)
        .configure(ScannerConfig(actions: wide, extraKeys: current.extraKeys));
  }

  @override
  void dispose() {
    _sub?.cancel();
    final restore = _restore;
    if (restore != null) {
      unawaited(ref.read(scanChannelProvider).configure(restore));
    }
    super.dispose();
  }

  Future<void> _adopt(DiagnosticEvent event, String key) async {
    final l10n = S.of(context);
    await ref
        .read(scannerConfigProvider.notifier)
        .save(ScannerConfig(actions: [event.action], extraKeys: [key]));
    _restore = null;
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l10n.saved)));
      Navigator.of(context).pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = S.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(l10n.diagnostics)),
      body: Column(
        children: [
          Padding(padding: EdgeInsets.all(16), child: Text(l10n.diagnosticsHint)),
          const Divider(height: 1),
          Expanded(
            child: _events.isEmpty
                ? Center(child: Text(l10n.diagnosticsEmpty))
                : ListView.separated(
                    itemCount: _events.length,
                    separatorBuilder: (_, _) => const Divider(height: 1),
                    itemBuilder: (_, i) {
                      final event = _events[i];
                      return ExpansionTile(
                        title: Text(
                          event.action,
                          style: const TextStyle(
                            fontFamily: 'monospace',
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        subtitle: Text('${event.extras.length} Extras'),
                        children: [
                          for (final entry in event.extras.entries)
                            ListTile(
                              dense: true,
                              title: Text(
                                entry.key,
                                style: const TextStyle(fontFamily: 'monospace'),
                              ),
                              subtitle: Text(entry.value),
                              trailing: TextButton(
                                onPressed: () => _adopt(event, entry.key),
                                child: Text(l10n.useThisPair),
                              ),
                            ),
                        ],
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}
