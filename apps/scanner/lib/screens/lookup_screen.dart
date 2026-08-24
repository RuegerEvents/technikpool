import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/client.dart';
import '../api/generated/export.dart';
import '../l10n/labels.dart';
import '../l10n/strings.dart';
import '../scan/camera_scan_screen.dart';
import '../state/providers.dart';

/// Scan a tag outside a session to see what the thing is and where it's been —
/// without booking it anywhere.
class LookupScreen extends ConsumerStatefulWidget {
  const LookupScreen({super.key});

  @override
  ConsumerState<LookupScreen> createState() => _LookupScreenState();
}

class _LookupScreenState extends ConsumerState<LookupScreen> {
  final _controller = TextEditingController();
  StreamSubscription<String>? _sub;
  AssetDetail? _asset;
  String? _error;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _sub = ref.read(scanBusProvider).codes.listen((tag) {
      // Every tab stays mounted inside the IndexedStack, so this hears scans
      // meant for a session too. Only react when it is the tab in front.
      if (!mounted || ref.read(activeTabProvider) != HomeTab.lookup) return;
      unawaited(_lookup(tag.trim()));
    });
  }

  @override
  void dispose() {
    _sub?.cancel();
    _controller.dispose();
    super.dispose();
  }

  Future<void> _lookup(String tag) async {
    if (tag.isEmpty || _busy) return;
    final api = ref.read(apiClientProvider);
    if (api == null) return;

    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final asset = await api.inventory.getAssetByTag(tag: tag);
      if (mounted) setState(() => _asset = asset);
    } catch (error) {
      if (mounted) {
        setState(() {
          _asset = null;
          _error = describeError(error);
        });
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text(S.lookup),
        actions: [
          if (ref.watch(scanSettingsProvider).cameraEnabled)
            IconButton(
              tooltip: S.scanWithCamera,
              onPressed: () => CameraScanScreen.once(context, title: S.lookup),
              icon: const Icon(Icons.photo_camera_outlined),
            ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(12),
            child: TextField(
              controller: _controller,
              textInputAction: TextInputAction.search,
              decoration: const InputDecoration(
                labelText: S.manualEntry,
                prefixIcon: Icon(Icons.qr_code_scanner),
              ),
              onSubmitted: (v) => _lookup(v.trim()),
            ),
          ),
          if (_busy) const LinearProgressIndicator(),
          Expanded(child: _body()),
        ],
      ),
    );
  }

  Widget _body() {
    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(_error!, textAlign: TextAlign.center),
        ),
      );
    }
    final asset = _asset;
    if (asset == null) {
      return const Center(child: Text(S.lookupHint));
    }

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text(
          '${asset.product.manufacturerName} ${asset.product.name}',
          style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 4),
        Text(
          asset.assetTag ?? '—',
          style: const TextStyle(fontFamily: 'monospace', fontSize: 16),
        ),
        const SizedBox(height: 20),
        _row(S.status, Labels.assetStatus(asset.status)),
        _row(S.serialNumber, asset.serialNumber ?? '—'),
        _row(S.currentLocation, asset.location.name),
        if (asset.currentProduction != null)
          _row(S.checkedOutTo, asset.currentProduction!.name),
        const SizedBox(height: 24),
        const Text(S.history, style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
        const SizedBox(height: 8),
        for (final tx in asset.history)
          ListTile(
            dense: true,
            contentPadding: EdgeInsets.zero,
            title: Text(Labels.transactionAction(tx.action)),
            subtitle: Text(
              [
                tx.createdAt.toLocal().toString().substring(0, 16),
                if (tx.userName != null) tx.userName!,
                if (tx.productionName != null) tx.productionName!,
              ].join(' · '),
            ),
          ),
      ],
    );
  }

  Widget _row(String label, String value) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 6),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 150,
          child: Text(
            label,
            style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant),
          ),
        ),
        Expanded(
          child: Text(value, style: const TextStyle(fontWeight: FontWeight.w500)),
        ),
      ],
    ),
  );
}
