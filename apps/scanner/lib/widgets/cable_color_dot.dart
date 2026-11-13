import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../cable_colors.dart';
import '../l10n/generated/app_localizations.dart';
import '../l10n/labels.dart';
import '../state/providers.dart';

/// The tape colour a cable is marked with, as a dot. Ringed, so white stays
/// visible on a light surface and black on a dark one; the colour's name is
/// its tooltip and what a screen reader says.
class CableColorDot extends StatelessWidget {
  const CableColorDot(this.color, {super.key, this.size = 12});

  final CableColor color;
  final double size;

  @override
  Widget build(BuildContext context) {
    final ring = Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.4);
    return Tooltip(
      message: Labels.cableColor(S.of(context), color),
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          color: color.color,
          shape: BoxShape.circle,
          border: Border.all(color: ring),
        ),
      ),
    );
  }
}

/// The dot of a unit owned by [organizationId] whose product is [lengthCm]
/// long, or nothing when it has no colour. [gap] is the space after it, kept
/// only when there is a dot to space.
class UnitCableColorDot extends ConsumerWidget {
  const UnitCableColorDot({
    super.key,
    required this.organizationId,
    required this.lengthCm,
    this.gap = 0,
  });

  final String? organizationId;
  final int? lengthCm;
  final double gap;

  @override
  Widget build(BuildContext context, WidgetRef ref) => _spaced(
    ref.watch(cableColorLookupProvider).colorFor(organizationId, lengthCm),
    gap,
  );
}

Widget _spaced(CableColor? color, double gap) {
  if (color == null) return const SizedBox.shrink();
  if (gap == 0) return CableColorDot(color);
  return Padding(
    padding: EdgeInsets.only(right: gap),
    child: CableColorDot(color),
  );
}

/// [title] with a cable colour's dot in front of it, or [title] alone when
/// there is no colour — so a row without one keeps its old layout exactly.
Widget withCableColorDot(Widget title, CableColor? color) {
  if (color == null) return title;
  return Row(
    children: [
      CableColorDot(color),
      const SizedBox(width: 6),
      Flexible(child: title),
    ],
  );
}

/// The dot and the colour's name, for a screen with room to say it.
class CableColorLabel extends StatelessWidget {
  const CableColorLabel(this.color, {super.key, this.style});

  final CableColor color;
  final TextStyle? style;

  @override
  Widget build(BuildContext context) => Row(
    children: [
      // The name is right beside it; read once, not twice.
      ExcludeSemantics(child: CableColorDot(color, size: 14)),
      const SizedBox(width: 8),
      Flexible(
        child: Text(Labels.cableColor(S.of(context), color), style: style),
      ),
    ],
  );
}
