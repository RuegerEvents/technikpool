import 'dart:async';

import 'package:flutter/material.dart';

import '../api/client.dart';
import '../l10n/generated/app_localizations.dart';
import 'product_thumb.dart';

/// One search result that can be taken a number of times: a product's loose
/// units on one shelf.
class CountSearchHit {
  const CountSearchHit({
    required this.key,
    required this.title,
    required this.subtitle,
    required this.imageUrl,
    required this.available,
  });

  final String key;
  final String title;
  final String subtitle;
  final String? imageUrl;

  /// The most that can be taken, and the top of the stepper.
  final int available;
}

/// Find units by name and take a number of them — for what has no tag to
/// scan: cables into a kit, cables onto a hand-out list. The sheet stays open
/// after each [submit], so several products can be added in one go; the
/// search runs again so the numbers left are the server's.
///
/// [submit] returns the line to confirm with ("3 added").
Future<void> showCountSearchSheet({
  required BuildContext context,
  required String title,
  required String actionLabel,
  required Future<List<CountSearchHit>> Function(String q) search,
  required Future<String> Function(CountSearchHit hit, int count) submit,
}) => showModalBottomSheet<void>(
  context: context,
  isScrollControlled: true,
  showDragHandle: true,
  useSafeArea: true,
  builder: (_) => _CountSearchSheet(
    title: title,
    actionLabel: actionLabel,
    search: search,
    submit: submit,
  ),
);

class _CountSearchSheet extends StatefulWidget {
  const _CountSearchSheet({
    required this.title,
    required this.actionLabel,
    required this.search,
    required this.submit,
  });

  final String title;
  final String actionLabel;
  final Future<List<CountSearchHit>> Function(String q) search;
  final Future<String> Function(CountSearchHit hit, int count) submit;

  @override
  State<_CountSearchSheet> createState() => _CountSearchSheetState();
}

class _CountSearchSheetState extends State<_CountSearchSheet> {
  static const _minLength = 2;
  static const _debounceFor = Duration(milliseconds: 250);

  final _controller = TextEditingController();
  Timer? _debounce;

  /// Only the newest answer may land: typing is faster than the round trip.
  int _seq = 0;
  List<CountSearchHit>? _hits;
  String? _error;
  bool _searching = false;
  String? _busyKey;
  String? _done;
  final _counts = <String, int>{};

  @override
  void dispose() {
    _debounce?.cancel();
    _controller.dispose();
    super.dispose();
  }

  String get _query => _controller.text.trim();

  void _changed(String _) {
    _debounce?.cancel();
    if (_query.length < _minLength) {
      _seq++;
      setState(() {
        _hits = null;
        _error = null;
        _searching = false;
      });
      return;
    }
    _debounce = Timer(_debounceFor, _run);
  }

  Future<void> _run() async {
    final q = _query;
    if (q.length < _minLength) return;
    final l10n = S.of(context);
    final seq = ++_seq;
    setState(() => _searching = true);
    try {
      final hits = await widget.search(q);
      if (!mounted || seq != _seq) return;
      setState(() {
        _hits = hits;
        _error = null;
        // A count above what is left would only be refused.
        for (final hit in hits) {
          final count = _counts[hit.key];
          if (count != null && count > hit.available) _counts[hit.key] = hit.available;
        }
      });
    } catch (error) {
      if (mounted && seq == _seq) setState(() => _error = describeError(l10n, error));
    } finally {
      if (mounted && seq == _seq) setState(() => _searching = false);
    }
  }

  Future<void> _take(CountSearchHit hit) async {
    final l10n = S.of(context);
    final count = _counts[hit.key] ?? 1;
    setState(() {
      _busyKey = hit.key;
      _done = null;
    });
    try {
      final message = await widget.submit(hit, count);
      if (!mounted) return;
      setState(() {
        _done = message;
        _counts.remove(hit.key);
      });
      await _run();
    } catch (error) {
      if (mounted) setState(() => _error = describeError(l10n, error));
    } finally {
      if (mounted) setState(() => _busyKey = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = S.of(context);
    final scheme = Theme.of(context).colorScheme;
    final hits = _hits;
    return Padding(
      // The sheet scrolls with its own content; the keyboard is lifted here.
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SizedBox(
        height: MediaQuery.sizeOf(context).height * 0.75,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: Text(widget.title, style: Theme.of(context).textTheme.titleMedium),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: TextField(
                controller: _controller,
                autofocus: true,
                textInputAction: TextInputAction.search,
                decoration: InputDecoration(
                  labelText: l10n.search,
                  prefixIcon: const Icon(Icons.search),
                  isDense: true,
                ),
                onChanged: _changed,
                onSubmitted: (_) {
                  _debounce?.cancel();
                  _run();
                },
              ),
            ),
            if (_searching || _busyKey != null)
              const LinearProgressIndicator()
            else
              const SizedBox(height: 4),
            if (_done case final done?)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                child: Text(done, style: const TextStyle(fontWeight: FontWeight.w600)),
              ),
            if (_error case final error?)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                child: Text(error, style: TextStyle(color: scheme.error)),
              ),
            Expanded(
              child: hits == null
                  ? Padding(
                      padding: const EdgeInsets.all(24),
                      child: Text(
                        l10n.searchMinLength,
                        textAlign: TextAlign.center,
                        style: TextStyle(color: scheme.onSurfaceVariant),
                      ),
                    )
                  : hits.isEmpty
                  ? Padding(
                      padding: const EdgeInsets.all(24),
                      child: Text(l10n.noResults, textAlign: TextAlign.center),
                    )
                  : ListView.separated(
                      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                      itemCount: hits.length,
                      separatorBuilder: (_, _) => const Divider(height: 1),
                      itemBuilder: (_, i) => _row(l10n, hits[i]),
                    ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _row(S l10n, CountSearchHit hit) {
    final count = _counts[hit.key] ?? 1;
    final busy = _busyKey != null;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 8, 8),
      child: Row(
        children: [
          ProductThumb(url: hit.imageUrl, size: 40),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(hit.title, style: const TextStyle(fontWeight: FontWeight.w600)),
                Text(
                  hit.subtitle,
                  style: TextStyle(
                    fontSize: 12,
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
                ),
              ],
            ),
          ),
          IconButton(
            tooltip: l10n.countLess,
            visualDensity: VisualDensity.compact,
            onPressed: busy || count <= 1
                ? null
                : () => setState(() => _counts[hit.key] = count - 1),
            icon: const Icon(Icons.remove),
          ),
          SizedBox(
            width: 28,
            child: Text(
              '$count',
              textAlign: TextAlign.center,
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
          ),
          IconButton(
            tooltip: l10n.countMore,
            visualDensity: VisualDensity.compact,
            onPressed: busy || count >= hit.available
                ? null
                : () => setState(() => _counts[hit.key] = count + 1),
            icon: const Icon(Icons.add),
          ),
          FilledButton(
            onPressed: busy || hit.available < 1 ? null : () => _take(hit),
            child: Text(widget.actionLabel),
          ),
        ],
      ),
    );
  }
}
