import 'package:flutter/material.dart';

import '../theme.dart';

/// The last scan's outcome in a band that reads at arm's length, like the
/// session screen's, inverted while a scan is on its way. [idle] is what it
/// says before the first scan.
class ScanOutcomeBand extends StatelessWidget {
  const ScanOutcomeBand({
    super.key,
    required this.busy,
    required this.last,
    required this.idle,
  });

  final bool busy;
  final ({bool ok, String text})? last;
  final String idle;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final status = StatusColors.of(context);
    final last = this.last;
    return Container(
      margin: const EdgeInsets.fromLTRB(12, 12, 12, 0),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
      decoration: BoxDecoration(
        color: busy ? scheme.inverseSurface : scheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        children: [
          if (!busy && last != null) ...[
            Icon(
              last.ok ? Icons.check_circle : Icons.error,
              color: last.ok ? status.success : scheme.error,
            ),
            const SizedBox(width: 8),
          ],
          Expanded(
            child: Text(
              busy ? '…' : (last?.text ?? idle),
              style: TextStyle(
                fontWeight: FontWeight.w600,
                color: busy ? scheme.onInverseSurface : scheme.onSurface,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
