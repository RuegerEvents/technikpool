import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../l10n/generated/app_localizations.dart';
import '../state/providers.dart';
import 'label_printer.dart';

/// What to tell someone whose print did not go out.
String describePrintError(S l10n, LabelPrinterConfig printer, Object error) =>
    switch (error) {
      LabelPrintException(kind: LabelPrintFailure.timeout) => l10n.labelPrinterTimeout(
        '$printer',
      ),
      LabelPrintException(:final detail) => l10n.labelPrinterUnreachable(
        '$printer',
        detail ?? '',
      ),
      _ => l10n.labelPrinterUnreachable('$printer', '$error'),
    };

/// Asks for the printer's address and saves it. Shared by Settings and the
/// label screen, which offers it when no printer is set up yet.
Future<void> editLabelPrinter(BuildContext context, WidgetRef ref) =>
    showDialog<void>(context: context, builder: (_) => const _LabelPrinterDialog());

class _LabelPrinterDialog extends ConsumerStatefulWidget {
  const _LabelPrinterDialog();

  @override
  ConsumerState<_LabelPrinterDialog> createState() => _LabelPrinterDialogState();
}

class _LabelPrinterDialogState extends ConsumerState<_LabelPrinterDialog> {
  late final TextEditingController _address;
  late int _dpmm;
  String? _error;
  bool _testing = false;
  bool _calibrating = false;

  @override
  void initState() {
    super.initState();
    final printer = ref.read(labelPrinterProvider).value;
    _address = TextEditingController(text: printer?.toString() ?? '');
    _dpmm = printer?.dpmm ?? LabelPrinterConfig.defaultDpmm;
  }

  @override
  void dispose() {
    _address.dispose();
    super.dispose();
  }

  LabelPrinterConfig? _parsed(S l10n) {
    final printer = LabelPrinterConfig.parse(_address.text)?.withDpmm(_dpmm);
    setState(() => _error = printer == null ? l10n.labelPrinterInvalid : null);
    return printer;
  }

  Future<void> _save() async {
    final l10n = S.of(context);
    final printer = _parsed(l10n);
    if (printer == null) return;
    await ref.read(labelPrinterProvider.notifier).save(printer);
    if (mounted) Navigator.of(context).pop();
  }

  Future<void> _remove() async {
    await ref.read(labelPrinterProvider.notifier).save(null);
    if (mounted) Navigator.of(context).pop();
  }

  Future<void> _test() async {
    final l10n = S.of(context);
    final messenger = ScaffoldMessenger.of(context);
    final printer = _parsed(l10n);
    if (printer == null) return;
    setState(() => _testing = true);
    try {
      await sendToPrinter(printer, testLabelZpl(printer.dpmm));
      messenger.showSnackBar(SnackBar(content: Text(l10n.caseLabelSent('$printer'))));
    } catch (error) {
      if (mounted) setState(() => _error = describePrintError(l10n, printer, error));
    } finally {
      if (mounted) setState(() => _testing = false);
    }
  }

  Future<void> _calibrate() async {
    final l10n = S.of(context);
    final messenger = ScaffoldMessenger.of(context);
    final printer = _parsed(l10n);
    if (printer == null) return;
    setState(() => _calibrating = true);
    try {
      await sendToPrinter(printer, calibrateZpl);
      messenger.showSnackBar(SnackBar(content: Text(l10n.labelPrinterCalibrating)));
    } catch (error) {
      if (mounted) setState(() => _error = describePrintError(l10n, printer, error));
    } finally {
      if (mounted) setState(() => _calibrating = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = S.of(context);
    final hasPrinter = ref.watch(labelPrinterProvider).value != null;
    return AlertDialog(
      title: Text(l10n.labelPrinter),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(l10n.labelPrinterHelp),
          const SizedBox(height: 16),
          TextField(
            controller: _address,
            autofocus: true,
            keyboardType: TextInputType.url,
            autocorrect: false,
            decoration: InputDecoration(
              labelText: l10n.labelPrinterAddress,
              hintText: '192.168.1.50',
              errorText: _error,
              errorMaxLines: 3,
            ),
            onSubmitted: (_) => _save(),
          ),
          const SizedBox(height: 16),
          Text(
            l10n.labelPrinterResolution,
            style: Theme.of(context).textTheme.labelLarge,
          ),
          const SizedBox(height: 8),
          SegmentedButton<int>(
            segments: [
              for (final dpmm in LabelPrinterConfig.resolutions)
                ButtonSegment(value: dpmm, label: Text('${dpmm == 8 ? 203 : 300} dpi')),
            ],
            selected: {_dpmm},
            onSelectionChanged: (picked) => setState(() => _dpmm = picked.first),
          ),
          const SizedBox(height: 8),
          if (_testing || _calibrating)
            const LinearProgressIndicator()
          else
            Wrap(
              spacing: 8,
              children: [
                TextButton.icon(
                  onPressed: _test,
                  icon: const Icon(Icons.print_outlined),
                  label: Text(l10n.labelPrinterTest),
                ),
                TextButton.icon(
                  onPressed: _calibrate,
                  icon: const Icon(Icons.straighten),
                  label: Text(l10n.labelPrinterCalibrate),
                ),
              ],
            ),
          Text(
            l10n.labelPrinterCalibrateHint,
            style: TextStyle(
              color: Theme.of(context).colorScheme.onSurfaceVariant,
              fontSize: 12,
            ),
          ),
        ],
      ),
      actions: [
        if (hasPrinter)
          TextButton(onPressed: _remove, child: Text(l10n.labelPrinterRemove)),
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: Text(l10n.cancel),
        ),
        FilledButton(onPressed: _save, child: Text(l10n.save)),
      ],
    );
  }
}
