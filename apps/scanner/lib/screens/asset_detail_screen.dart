import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/client.dart';
import '../api/generated/export.dart';
import '../l10n/generated/app_localizations.dart';
import '../state/providers.dart';
import '../widgets/asset_detail_view.dart';
import 'case_check_screen.dart';

/// One unit, opened from a list rather than by scanning it: the same detail
/// Lookup shows. Read-only, and deaf to scans — a scan here belongs to no
/// one, and a case check opened from here listens for itself.
class AssetDetailScreen extends ConsumerStatefulWidget {
  const AssetDetailScreen({
    super.key,
    required this.assetId,
    required this.title,
    this.initial,
  });

  /// The unit as a lookup by tag already answered, so it shows at once.
  final AssetDetail? initial;

  /// Looked up by id, so a unit without a tag opens here too.
  final String assetId;

  /// Shown until the unit has loaded: its tag, or its number.
  final String title;

  @override
  ConsumerState<AssetDetailScreen> createState() => _AssetDetailScreenState();
}

class _AssetDetailScreenState extends ConsumerState<AssetDetailScreen> {
  late Future<AssetDetail>? _asset = switch (widget.initial) {
    final asset? => Future.value(asset),
    null => _fetch(),
  };

  Future<AssetDetail>? _fetch() =>
      ref.read(apiClientProvider)?.inventory.getAsset(assetId: widget.assetId);

  @override
  Widget build(BuildContext context) {
    final l10n = S.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(widget.title)),
      body: FutureBuilder<AssetDetail>(
        future: _asset,
        builder: (context, snapshot) {
          if (snapshot.hasError) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(describeError(l10n, snapshot.error!), textAlign: TextAlign.center),
                    const SizedBox(height: 12),
                    OutlinedButton(
                      onPressed: () => setState(() => _asset = _fetch()),
                      child: Text(l10n.retry),
                    ),
                  ],
                ),
              ),
            );
          }
          final asset = snapshot.data;
          if (asset == null) return const Center(child: CircularProgressIndicator());
          return AssetDetailView(
            asset: asset,
            // The view offers the case check for a tagged unit only.
            onCaseCheck: () => Navigator.of(context).push<void>(
              MaterialPageRoute(
                builder: (_) => CaseCheckScreen(initialCode: asset.assetTag),
              ),
            ),
          );
        },
      ),
    );
  }
}
