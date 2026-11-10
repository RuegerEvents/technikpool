import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/client.dart';
import '../api/generated/export.dart';
import '../l10n/generated/app_localizations.dart';
import '../legal.dart';
import '../print/label_printer.dart';
import '../print/label_printer_dialog.dart';
import '../state/providers.dart';

/// Printing a case's label (Kistenetikett): pick the roll that is loaded, look
/// at the label, send it. The server renders the ZPL (case-label-zpl.ts on
/// the web); this device sends it to the printer, which only it can reach.
class CaseLabelScreen extends ConsumerStatefulWidget {
  const CaseLabelScreen({
    super.key,
    required this.kind,
    required this.id,
    required this.name,
  });

  final CaseKind kind;
  final String id;
  final String name;

  @override
  ConsumerState<CaseLabelScreen> createState() => _CaseLabelScreenState();
}

class _CaseLabelScreenState extends ConsumerState<CaseLabelScreen> {
  CaseLabelSize? _size;
  Future<CaseLabel>? _label;
  Future<List<Uint8List>>? _preview;
  bool _printing = false;

  @override
  void initState() {
    super.initState();
    ref.read(labelSizeProvider.future).then((size) {
      if (mounted && _size == null) _load(size);
    });
  }

  void _load(CaseLabelSize size) {
    final api = ref.read(apiClientProvider);
    if (api == null) return;
    final label = api.caseCheck.getCaseLabel(
      kind: widget.kind,
      id: widget.id,
      size: size,
    );
    setState(() {
      _size = size;
      _label = label;
      _preview = label.then(_renderAll);
    });
  }

  /// One after the other: Labelary allows three requests a second.
  static Future<List<Uint8List>> _renderAll(CaseLabel label) async => [
    for (var i = 0; i < label.labelCount; i++) await labelaryPreview(label, index: i),
  ];

  void _pick(CaseLabelSize size) {
    if (size == _size) return;
    ref.read(labelSizeProvider.notifier).save(size);
    _load(size);
  }

  Future<void> _print(LabelPrinterConfig printer) async {
    final label = _label;
    if (label == null) return;
    final l10n = S.of(context);
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _printing = true);
    try {
      await sendToPrinter(printer, (await label).zpl);
      messenger.showSnackBar(SnackBar(content: Text(l10n.caseLabelSent('$printer'))));
    } catch (error) {
      final text = error is LabelPrintException
          ? describePrintError(l10n, printer, error)
          : describeError(l10n, error);
      messenger.showSnackBar(SnackBar(content: Text(text)));
    } finally {
      if (mounted) setState(() => _printing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = S.of(context);
    final printer = ref.watch(labelPrinterProvider).value;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;

    return Scaffold(
      appBar: AppBar(title: Text(l10n.caseLabel)),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(widget.name, style: const TextStyle(fontWeight: FontWeight.w600)),
          const SizedBox(height: 12),
          SegmentedButton<CaseLabelSize>(
            segments: [
              ButtonSegment(value: CaseLabelSize.large, label: Text(l10n.caseLabelLarge)),
              ButtonSegment(value: CaseLabelSize.small, label: Text(l10n.caseLabelSmall)),
            ],
            selected: {?_size},
            emptySelectionAllowed: _size == null,
            onSelectionChanged: (picked) {
              if (picked.isNotEmpty) _pick(picked.first);
            },
          ),
          const SizedBox(height: 16),
          FutureBuilder<CaseLabel>(
            future: _label,
            builder: (context, label) {
              if (label.hasError) {
                return Text(
                  describeError(l10n, label.error!),
                  style: TextStyle(color: Theme.of(context).colorScheme.error),
                );
              }
              final data = label.data;
              if (data == null) return const Center(child: CircularProgressIndicator());
              return Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _PreviewFrame(label: data, preview: _preview),
                  const SizedBox(height: 6),
                  Text(
                    l10n.caseLabelPreviewHint,
                    style: TextStyle(color: muted, fontSize: 12),
                  ),
                  const SizedBox(height: 16),
                  if (printer == null)
                    FilledButton.icon(
                      onPressed: () => editLabelPrinter(context, ref),
                      icon: const Icon(Icons.settings_outlined),
                      label: Text(l10n.labelPrinterSetUp),
                    )
                  else
                    FilledButton.icon(
                      onPressed: _printing ? null : () => _print(printer),
                      icon: _printing
                          ? const SizedBox.square(
                              dimension: 18,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.print),
                      label: Text('${l10n.caseLabelPrint} · $printer'),
                    ),
                  const SizedBox(height: 8),
                  OutlinedButton.icon(
                    onPressed: () => openExternal(context, Uri.parse(data.previewUrl)),
                    icon: const Icon(Icons.open_in_new),
                    label: Text(l10n.caseLabelOpenLabelary),
                  ),
                ],
              );
            },
          ),
        ],
      ),
    );
  }
}

/// Short enough for the frame: Labelary's status, or what kept it from answering.
String _why(Object error) => switch (error) {
  DioException(response: Response(:final statusCode?)) => 'HTTP $statusCode',
  DioException(:final type) => type.name,
  _ => '$error',
};

/// Each label at its own aspect ratio, white like the roll whatever the theme.
class _PreviewFrame extends StatelessWidget {
  const _PreviewFrame({required this.label, required this.preview});

  final CaseLabel label;
  final Future<List<Uint8List>>? preview;

  @override
  Widget build(BuildContext context) {
    final l10n = S.of(context);
    return FutureBuilder<List<Uint8List>>(
      future: preview,
      builder: (context, png) {
        if (png.hasError) {
          return _frame(
            context,
            Center(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Text(
                  l10n.caseLabelPreviewFailed(_why(png.error!)),
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Colors.black54),
                ),
              ),
            ),
          );
        }
        final pages = png.data;
        if (pages == null) {
          return _frame(context, const Center(child: CircularProgressIndicator()));
        }
        return Column(
          children: [
            for (final (i, bytes) in pages.indexed) ...[
              if (i > 0) const SizedBox(height: 12),
              _frame(
                context,
                Padding(
                  padding: const EdgeInsets.all(4),
                  child: Image.memory(bytes, fit: BoxFit.contain, gaplessPlayback: true),
                ),
              ),
              if (pages.length > 1)
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text(l10n.caseLabelPage(i + 1, pages.length)),
                ),
            ],
          ],
        );
      },
    );
  }

  Widget _frame(BuildContext context, Widget child) => Center(
    child: ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 360, maxHeight: 520),
      child: AspectRatio(
        aspectRatio: label.widthMm / label.heightMm,
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: Colors.white,
            border: Border.all(color: Theme.of(context).dividerColor),
            borderRadius: BorderRadius.circular(6),
          ),
          child: child,
        ),
      ),
    ),
  );
}
