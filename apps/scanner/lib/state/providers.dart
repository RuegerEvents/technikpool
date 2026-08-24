import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../api/auth_service.dart';
import '../api/client.dart';
import '../api/generated/export.dart';
import '../scan/scan_channel.dart';

const _kBaseUrl = 'base_url';
const _kToken = 'session_token';
const _kScannerConfig = 'scanner_config';

final storageProvider = Provider((_) => const FlutterSecureStorage());

final scanChannelProvider = Provider((_) => ScanChannel());

/// Decoded barcodes from the hardware trigger.
final scanStreamProvider = StreamProvider<String>(
  (ref) => ref.watch(scanChannelProvider).scans,
);

/// What we know about the pairing, persisted between launches.
class Credentials {
  const Credentials({this.baseUrl, this.token});

  final String? baseUrl;
  final String? token;

  bool get isPaired => baseUrl != null && token != null;
}

class CredentialsNotifier extends AsyncNotifier<Credentials> {
  FlutterSecureStorage get _storage => ref.read(storageProvider);

  @override
  Future<Credentials> build() async {
    final results = await Future.wait([
      _storage.read(key: _kBaseUrl),
      _storage.read(key: _kToken),
    ]);
    return Credentials(baseUrl: results[0], token: results[1]);
  }

  Future<void> save({required String baseUrl, required String token}) async {
    await _storage.write(key: _kBaseUrl, value: baseUrl);
    await _storage.write(key: _kToken, value: token);
    state = AsyncData(Credentials(baseUrl: baseUrl, token: token));
  }

  /// Drop the token but keep the server address — re-pairing the same device
  /// shouldn't mean reading the QR again.
  Future<void> signOut() async {
    final baseUrl = state.value?.baseUrl;
    await _storage.delete(key: _kToken);
    state = AsyncData(Credentials(baseUrl: baseUrl));
  }
}

final credentialsProvider = AsyncNotifierProvider<CredentialsNotifier, Credentials>(
  CredentialsNotifier.new,
);

/// Scanner broadcast configuration, editable in settings.
class ScannerConfigNotifier extends AsyncNotifier<ScannerConfig> {
  FlutterSecureStorage get _storage => ref.read(storageProvider);

  @override
  Future<ScannerConfig> build() async {
    final raw = await _storage.read(key: _kScannerConfig);
    final config = raw == null
        ? ScannerConfig.defaults
        : ScannerConfig.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    await ref.read(scanChannelProvider).configure(config);
    return config;
  }

  Future<void> save(ScannerConfig config) async {
    await _storage.write(key: _kScannerConfig, value: jsonEncode(config.toJson()));
    await ref.read(scanChannelProvider).configure(config);
    state = AsyncData(config);
  }
}

final scannerConfigProvider = AsyncNotifierProvider<ScannerConfigNotifier, ScannerConfig>(
  ScannerConfigNotifier.new,
);

/// An API client for whatever we're currently paired with. Rebuilt whenever the
/// credentials change, so signing out invalidates every dependent request.
final apiClientProvider = Provider<ApiClient?>((ref) {
  final creds = ref.watch(credentialsProvider).value;
  if (creds?.baseUrl == null) return null;
  return ApiClient(baseUrl: creds!.baseUrl!, token: creds.token);
});

/// A client for pairing, before any token exists.
final pairingApiProvider = Provider.family<ApiClient, String>(
  (ref, baseUrl) => ApiClient(baseUrl: baseUrl),
);

final authServiceProvider = Provider.family<AuthService, String>(
  (ref, baseUrl) => AuthService(ref.watch(pairingApiProvider(baseUrl))),
);

ApiClient _requireApi(Ref ref) {
  final api = ref.watch(apiClientProvider);
  if (api == null) throw StateError('not paired');
  return api;
}

final currentUserProvider = FutureProvider<CurrentUser>(
  (ref) => _requireApi(ref).identity.getCurrentUser(),
);

final locationsProvider = FutureProvider<List<Location>>(
  (ref) => _requireApi(ref).inventory.listLocations(),
);

final productionsProvider = FutureProvider<List<Production>>(
  (ref) => _requireApi(ref).inventory.listProductions(),
);
