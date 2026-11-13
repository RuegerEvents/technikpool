import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/client.dart';
import '../api/generated/export.dart';
import '../l10n/generated/app_localizations.dart';
import '../org_access.dart';
import '../scan/camera_scan_screen.dart';
import '../scan/scan_tones.dart';
import '../state/providers.dart';
import '../widgets/category_field.dart';
import 'bundle_screen.dart';

/// Make a new, empty kit (Bundle): organization, name, category, and a tag if
/// the case already carries a sticker — scanning it fills the field. On
/// success the kit's own screen takes this one's place, so it can be filled
/// by scanning straight away.
class BundleNewScreen extends ConsumerStatefulWidget {
  const BundleNewScreen({super.key});

  @override
  ConsumerState<BundleNewScreen> createState() => _BundleNewScreenState();
}

class _BundleNewScreenState extends ConsumerState<BundleNewScreen> {
  final _name = TextEditingController();
  final _tag = TextEditingController();
  final _caption = TextEditingController();
  StreamSubscription<String>? _sub;
  String? _orgId;
  String? _categoryId;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    // A scan while this form is open is the case's sticker.
    _sub = ref.read(scanBusProvider).codes.listen((code) {
      final trimmed = code.trim();
      if (!mounted || trimmed.isEmpty || _saving) return;
      setState(() => _tag.text = trimmed);
      ref.scanTone(ScanTone.ok);
    });
  }

  @override
  void dispose() {
    _sub?.cancel();
    _name.dispose();
    _tag.dispose();
    _caption.dispose();
    super.dispose();
  }

  bool get _complete =>
      _orgId != null && _categoryId != null && _name.text.trim().isNotEmpty;

  Future<void> _create() async {
    final orgId = _orgId;
    final categoryId = _categoryId;
    final api = ref.read(apiClientProvider);
    if (orgId == null || categoryId == null || api == null) return;
    // Read before the await — see SessionScreen._submit.
    final l10n = S.of(context);
    final messenger = ScaffoldMessenger.of(context);
    final navigator = Navigator.of(context);
    String? text(TextEditingController c) => c.text.trim().isEmpty ? null : c.text.trim();

    setState(() => _saving = true);
    try {
      final created = await api.bundles.createBundle(
        body: BundleCreateRequest(
          organizationId: orgId,
          name: _name.text.trim(),
          categoryId: categoryId,
          caption: text(_caption),
          tag: text(_tag),
        ),
      );
      if (!mounted) return;
      ref.invalidate(bundlesProvider);
      messenger.showSnackBar(SnackBar(content: Text(l10n.bundleCreated(created.name))));
      unawaited(
        navigator.pushReplacement(
          MaterialPageRoute<void>(
            builder: (_) =>
                BundleScreen(bundleId: created.id, name: created.name, startEditing: true),
          ),
        ),
      );
    } catch (error) {
      messenger.showSnackBar(SnackBar(content: Text(describeError(l10n, error))));
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = S.of(context);
    final me = ref.watch(currentUserProvider);
    final categoriesAsync = ref.watch(categoriesProvider);
    final cameraEnabled = ref.watch(scanSettingsProvider).cameraEnabled;

    return Scaffold(
      appBar: AppBar(title: Text(l10n.bundleNew)),
      body: me.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(child: Text(describeError(l10n, error))),
        data: (user) {
          final orgs = manageableOrgs(user);
          if (orgs.isEmpty) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Text(l10n.stocktakeNoOrgs, textAlign: TextAlign.center),
              ),
            );
          }
          if (_orgId == null || !orgs.any((o) => o.id == _orgId)) _orgId = orgs.first.id;
          final categories = categoriesAsync.value ?? const <Category>[];

          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              if (orgs.length > 1) ...[
                DropdownButtonFormField<String>(
                  initialValue: _orgId,
                  isExpanded: true,
                  decoration: InputDecoration(labelText: l10n.stocktakeOrganization),
                  items: [
                    for (final org in orgs)
                      DropdownMenuItem(
                        value: org.id,
                        child: Text(org.name, overflow: TextOverflow.ellipsis),
                      ),
                  ],
                  onChanged: (id) => setState(() => _orgId = id),
                ),
                const SizedBox(height: 16),
              ],
              TextField(
                controller: _name,
                textCapitalization: TextCapitalization.sentences,
                decoration: InputDecoration(labelText: l10n.bundleName),
                onChanged: (_) => setState(() {}),
              ),
              const SizedBox(height: 16),
              CategoryField(
                categories: categories,
                value: _categoryId,
                label: l10n.bundleCategory,
                helperText: categoriesAsync.hasError
                    ? describeError(l10n, categoriesAsync.error!)
                    : null,
                onChanged: (id) => setState(() => _categoryId = id),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _tag,
                decoration: InputDecoration(
                  labelText: l10n.bundleTag,
                  helperText: l10n.bundleTagHint,
                  prefixIcon: const Icon(Icons.qr_code_scanner),
                  suffixIcon: cameraEnabled
                      ? IconButton(
                          tooltip: l10n.scanWithCamera,
                          onPressed: () =>
                              CameraScanScreen.once(context, title: l10n.bundleTag),
                          icon: const Icon(Icons.photo_camera_outlined),
                        )
                      : null,
                ),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _caption,
                textCapitalization: TextCapitalization.sentences,
                decoration: InputDecoration(labelText: l10n.bundleCaption),
              ),
              const SizedBox(height: 24),
              FilledButton.icon(
                onPressed: _saving || !_complete ? null : _create,
                icon: const Icon(Icons.add_box_outlined),
                label: Text(l10n.bundleCreate),
              ),
            ],
          );
        },
      ),
    );
  }
}
