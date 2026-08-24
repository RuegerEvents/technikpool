import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../api/generated/export.dart';

/// A category, shown the way the web app shows it.
///
/// Ported from `category-pill.svelte` and `getContrastingTextColor` in
/// `apps/web/src/lib/utils.ts`, thresholds included, so a category reads the
/// same on a handheld as it does in the browser.
class CategoryPill extends StatelessWidget {
  const CategoryPill(this.category, {super.key, this.dense = false});

  final Category category;

  /// Sized to sit inside a list row rather than to stand alone.
  final bool dense;

  @override
  Widget build(BuildContext context) {
    // A category with no usable colour falls back to the surface, which keeps
    // the pill legible instead of painting it black.
    final background =
        parseHexColor(category.color) ??
        Theme.of(context).colorScheme.surfaceContainerHighest;
    final foreground = contrastingTextColor(background);

    return Container(
      padding: dense
          ? const EdgeInsets.symmetric(horizontal: 8, vertical: 1)
          : const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(999),
        // The default category colour is white, which would otherwise vanish
        // against a light card. The web gets away with it on a big screen; a
        // PDA in a dim warehouse does not.
        border: Border.all(color: foreground.withValues(alpha: 0.16)),
      ),
      child: Text(
        category.name,
        style: TextStyle(
          color: foreground,
          fontSize: dense ? 11 : 12,
          fontWeight: FontWeight.w600,
          height: 1.3,
        ),
      ),
    );
  }
}

/// `#rgb` or `#rrggbb`, matching the web's parser — anything else is null
/// rather than a guess.
@visibleForTesting
Color? parseHexColor(String input) {
  final value = input.trim();
  if (!value.startsWith('#')) return null;

  final raw = value.substring(1);
  if (!RegExp(r'^[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$').hasMatch(raw)) return null;

  final normalized = raw.length == 3 ? raw.split('').map((c) => '$c$c').join() : raw;
  return Color(0xFF000000 | int.parse(normalized, radix: 16));
}

/// Black or white, whichever is readable on [background].
///
/// WCAG relative luminance, with the web's 0.3 threshold rather than the
/// textbook 0.5 — it favours black text, which is what the pastel-ish palette
/// people actually pick needs.
@visibleForTesting
Color contrastingTextColor(Color background) {
  double channel(double c) =>
      c <= 0.03928 ? c / 12.92 : math.pow((c + 0.055) / 1.055, 2.4).toDouble();

  final luminance =
      0.2126 * channel(background.r) +
      0.7152 * channel(background.g) +
      0.0722 * channel(background.b);

  return luminance > 0.3 ? const Color(0xFF000000) : const Color(0xFFFFFFFF);
}
