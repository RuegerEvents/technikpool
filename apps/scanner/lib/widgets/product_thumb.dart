import 'package:flutter/material.dart';

/// A product's picture as a small square beside a row, as the web lists show
/// it — so a unit is recognised before its name is read. A product without a
/// picture, or one that fails to load (no network in a hall corner), gets a
/// quiet placeholder of the same size, so the rows stay lined up.
class ProductThumb extends StatelessWidget {
  const ProductThumb({super.key, required this.url, this.size = 36});

  final String? url;
  final double size;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final placeholder = Icon(
      Icons.image_outlined,
      size: size * 0.5,
      color: scheme.onSurfaceVariant.withValues(alpha: 0.5),
    );
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: scheme.surface,
        border: Border.all(color: scheme.outlineVariant),
        borderRadius: BorderRadius.circular(6),
      ),
      clipBehavior: Clip.antiAlias,
      padding: const EdgeInsets.all(1),
      alignment: Alignment.center,
      child: switch (url) {
        final url? => Image.network(
          url,
          fit: BoxFit.contain,
          // Decoded at the size it is shown, not the photo's own.
          cacheWidth: (size * MediaQuery.devicePixelRatioOf(context)).round(),
          errorBuilder: (_, _, _) => placeholder,
        ),
        null => placeholder,
      },
    );
  }
}
