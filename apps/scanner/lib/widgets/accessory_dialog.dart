import 'package:flutter/material.dart';

import '../l10n/generated/app_localizations.dart';
import 'product_thumb.dart';

/// One accessory as the question lists it.
typedef AccessoryChoice = ({
  String assetId,
  String name,
  String? assetTag,
  String? imageUrl,
});

/// Asked after a unit with accessories went on a list: is all of it there?
/// Booking a unit takes what hangs off it along, and mostly that is right —
/// but a power cable left in the van is exactly what nobody notices later.
/// Everything starts ticked, so confirming changes nothing; what is unticked
/// is booked back on its own. Answers with the accessories that are there,
/// or null when dismissed, which leaves them all as they are.
class AccessoryDialog extends StatefulWidget {
  const AccessoryDialog({
    super.key,
    required this.title,
    required this.question,
    required this.accessories,
  });

  final String title;
  final String question;
  final List<AccessoryChoice> accessories;

  @override
  State<AccessoryDialog> createState() => _AccessoryDialogState();
}

class _AccessoryDialogState extends State<AccessoryDialog> {
  late final _there = {for (final a in widget.accessories) a.assetId};

  @override
  Widget build(BuildContext context) {
    final l10n = S.of(context);
    return AlertDialog(
      title: Text(widget.title),
      contentPadding: const EdgeInsets.fromLTRB(8, 16, 8, 0),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Text(widget.question),
            ),
            const SizedBox(height: 8),
            for (final a in widget.accessories)
              CheckboxListTile(
                value: _there.contains(a.assetId),
                dense: true,
                // The picture first, as in the lists: a unit is recognised
                // before its name is read.
                secondary: ProductThumb(url: a.imageUrl),
                title: Text(a.name),
                subtitle: Text(a.assetTag ?? l10n.caseCheckNoTag),
                onChanged: (on) => setState(() {
                  if (on ?? false) {
                    _there.add(a.assetId);
                  } else {
                    _there.remove(a.assetId);
                  }
                }),
              ),
          ],
        ),
      ),
      actions: [
        FilledButton(
          onPressed: () => Navigator.of(context).pop(Set<String>.of(_there)),
          child: Text(l10n.accessoryDialogConfirm),
        ),
      ],
    );
  }
}
