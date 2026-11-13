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
  CaseLabelScreen({
    super.key,
    required CaseKind kind,
    required String id,
    required this.name,
  }) : load = ((api, size) => api.caseCheck.getCaseLabel(kind: kind, id: id, size: size));

  /// A pack case's label for one production: the production, the case's
  /// number and what is in it now — see `getPackCaseLabel`.
  CaseLabelScreen.packCase({
    super.key,
    required String productionId,
    required String caseAssetId,
    required this.name,
  }) : load = ((api, size) => api.productionHandout.getPackCaseLabel(
         productionId: productionId,
         caseAssetId: caseAssetId,
         size: size,
       ));

  /// Fetches the label of a size from the server.
  final Future<CaseLabel> Function(ApiClient api, CaseLabelSize size) load;
  final String name;

  @override
  ConsumerState<CaseLabelScreen> createState() => _CaseLabelScreenState();
}

/// A preview as it is drawn: the label and its pictures together, so a
/// picture is never framed at another label's aspect ratio. [pages] is null
/// when Labelary did not answer, and [error] then says why.
typedef _Preview = ({CaseLabel label, List<Uint8List>? pages, Object? error});

class _CaseLabelScreenState extends ConsumerState<CaseLabelScreen> {
  CaseLabelSize? _size;

  /// The label of the size picked, once the server sent it — what is printed.
  CaseLabel? _label;
  Object? _labelError;

  /// What the frame shows. Replaced only once the new size's pictures are in,
  /// so switching sizes keeps the old preview, at its own shape, until then.
  _Preview? _shown;
  bool _rendering = false;

  /// Only the newest size may land: an answer for one picked earlier that
  /// arrives late must not overwrite it.
  int _seq = 0;
  bool _printing = false;

  @override
  void initState() {
    super.initState();
    ref.read(labelSizeProvider.future).then((size) {
      if (mounted && _size == null) _load(size);
    });
  }

  Future<void> _load(CaseLabelSize size) async {
    final api = ref.read(apiClientProvider);
    if (api == null) return;
    final seq = ++_seq;
    setState(() {
      _size = size;
      _label = null;
      _labelError = null;
      _rendering = true;
    });
    final CaseLabel label;
    try {
      label = await widget.load(api, size);
    } catch (error) {
      if (mounted && seq == _seq) {
        setState(() {
          _labelError = error;
          _rendering = false;
        });
      }
      return;
    }
    if (!mounted || seq != _seq) return;
    setState(() => _label = label);

    List<Uint8List>? pages;
    Object? previewError;
    try {
      pages = await _renderAll(label);
    } catch (error) {
      previewError = error;
    }
    if (!mounted || seq != _seq) return;
    setState(() {
      _shown = (label: label, pages: pages, error: previewError);
      _rendering = false;
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
      await sendToPrinter(printer, label.zpl);
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
    final label = _label;

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
          if (_labelError case final error?)
            Text(
              describeError(l10n, error),
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            )
          else ...[
            _PreviewFrame(shown: _shown, loading: _rendering),
            const SizedBox(height: 6),
            Text(l10n.caseLabelPreviewHint, style: TextStyle(color: muted, fontSize: 12)),
            const SizedBox(height: 16),
            if (printer == null)
              FilledButton.icon(
                onPressed: () => editLabelPrinter(context, ref),
                icon: const Icon(Icons.settings_outlined),
                label: Text(l10n.labelPrinterSetUp),
              )
            else
              FilledButton.icon(
                onPressed: _printing || label == null ? null : () => _print(printer),
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
              onPressed: label == null
                  ? null
                  : () => openExternal(context, Uri.parse(label.previewUrl)),
              icon: const Icon(Icons.open_in_new),
              label: Text(l10n.caseLabelOpenLabelary),
            ),
          ],
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
///
/// While another size loads, the preview in hand stays at its own shape under
/// a spinner — never stretched to the new one — and is swapped for the new
/// label and its pictures in one go.
class _PreviewFrame extends StatelessWidget {
  const _PreviewFrame({required this.shown, required this.loading});

  final _Preview? shown;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    final l10n = S.of(context);
    final preview = shown;
    if (preview == null) {
      return const Padding(
        padding: EdgeInsets.all(24),
        child: Center(child: CircularProgressIndicator()),
      );
    }
    final pages = preview.pages;
    final Widget content;
    if (pages == null) {
      content = _frame(
        context,
        preview.label,
        Center(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Text(
              l10n.caseLabelPreviewFailed(_why(preview.error ?? '')),
              textAlign: TextAlign.center,
              style: const TextStyle(color: Colors.black54),
            ),
          ),
        ),
      );
    } else {
      content = Column(
        children: [
          for (final (i, bytes) in pages.indexed) ...[
            if (i > 0) const SizedBox(height: 12),
            _frame(
              context,
              preview.label,
              Padding(
                padding: const EdgeInsets.all(4),
                child: Image.memory(bytes, fit: BoxFit.contain),
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
    }
    return Stack(
      alignment: Alignment.topCenter,
      children: [
        AnimatedOpacity(
          opacity: loading ? 0.4 : 1,
          duration: const Duration(milliseconds: 150),
          child: content,
        ),
        if (loading)
          const Padding(
            padding: EdgeInsets.only(top: 48),
            child: CircularProgressIndicator(),
          ),
      ],
    );
  }

  Widget _frame(BuildContext context, CaseLabel label, Widget child) => Center(
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
