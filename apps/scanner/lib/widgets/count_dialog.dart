import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../l10n/generated/app_localizations.dart';

/// Typing a number for a counted line — a stocktake's loose products, and the
/// untagged units on a production's list. −/+ beside the field for the last
/// one or two, the keyboard for forty. [max] caps it where more than a line
/// holds makes no sense; a stocktake has none, since finding more than
/// expected is exactly what it is there to notice.
class CountDialog extends StatefulWidget {
  const CountDialog({
    super.key,
    required this.title,
    required this.initial,
    required this.label,
    this.max,
  });

  final String title;
  final int? initial;
  final String label;
  final int? max;

  @override
  State<CountDialog> createState() => _CountDialogState();
}

class _CountDialogState extends State<CountDialog> {
  late final _controller = TextEditingController(
    text: widget.initial?.toString() ?? '',
  );

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  int get _value => int.tryParse(_controller.text.trim()) ?? 0;

  void _step(int by) {
    final next = _value + by;
    if (next < 0 || (widget.max != null && next > widget.max!)) return;
    _controller.text = next.toString();
    _controller.selection = TextSelection.collapsed(
      offset: _controller.text.length,
    );
  }

  void _save() {
    final value = int.tryParse(_controller.text.trim());
    if (value == null || value < 0) return;
    Navigator.of(context)
        .pop(widget.max == null ? value : value.clamp(0, widget.max!));
  }

  @override
  Widget build(BuildContext context) {
    final l10n = S.of(context);
    return AlertDialog(
      title: Text(widget.title),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(widget.label, style: Theme.of(context).textTheme.bodyMedium),
          const SizedBox(height: 8),
          Row(
            children: [
              IconButton.filledTonal(
                tooltip: l10n.stocktakeMinusOne,
                onPressed: () => _step(-1),
                icon: const Icon(Icons.remove),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: TextField(
                  controller: _controller,
                  autofocus: true,
                  textAlign: TextAlign.center,
                  keyboardType: TextInputType.number,
                  inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                  decoration: InputDecoration(
                    hintText: '0',
                    suffixText: widget.max == null ? null : '/ ${widget.max}',
                  ),
                  onSubmitted: (_) => _save(),
                ),
              ),
              const SizedBox(width: 8),
              IconButton.filledTonal(
                tooltip: l10n.stocktakePlusOne,
                onPressed: () => _step(1),
                icon: const Icon(Icons.add),
              ),
            ],
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: Text(l10n.cancel),
        ),
        FilledButton(onPressed: _save, child: Text(l10n.save)),
      ],
    );
  }
}
