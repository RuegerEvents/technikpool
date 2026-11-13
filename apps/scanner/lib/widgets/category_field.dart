import 'package:flutter/material.dart';

import '../api/generated/export.dart';
import 'category_pill.dart';

/// A category picker that shows each category as its coloured pill, the way
/// the web lists them — so "Ton" is recognised by colour before it is read.
class CategoryField extends StatelessWidget {
  const CategoryField({
    super.key,
    required this.categories,
    required this.value,
    required this.label,
    required this.onChanged,
    this.helperText,
  });

  final List<Category> categories;
  final String? value;
  final String label;
  final String? helperText;
  final ValueChanged<String?> onChanged;

  @override
  Widget build(BuildContext context) {
    return DropdownButtonFormField<String>(
      initialValue: categories.any((c) => c.id == value) ? value : null,
      isExpanded: true,
      decoration: InputDecoration(labelText: label, helperText: helperText),
      items: [
        for (final category in categories)
          DropdownMenuItem(
            value: category.id,
            child: Align(
              alignment: AlignmentDirectional.centerStart,
              child: CategoryPill(category),
            ),
          ),
      ],
      onChanged: onChanged,
    );
  }
}
