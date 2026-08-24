import 'dart:convert';

import 'package:flutter/widgets.dart' show Locale;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../api/auth_service.dart';
import '../api/client.dart';
import '../api/generated/export.dart';
import '../demo/demo_api.dart';
import '../scan/scan_bus.dart';
import '../scan/scan_channel.dart';
import '../scan/scan_settings.dart';

const _kBaseUrl = 'base_url';
const _kToken = 'session_token';
const _kScannerConfig = 'scanner_config';
const _kScanMode = 'scan_mode';
const _kHardwareSeen = 'hardware_seen';
const _kLocale = 'locale';

final storageProvider = Provider((_) => const FlutterSecureStorage());

final scanChannelProvider = Provider((_) => ScanChannel());

/// Every decoded barcode, from the trigger or from the camera. Screens listen
/// here; nothing else should touch [ScanChannel.scans] directly.
final scanBusProvider = Provider<ScanBus>((ref) {
  final bus = ScanBus(ref.watch(scanChannelProvider));
  // The first broadcast a device ever delivers is the only honest evidence
  // that it has a scan engine, so it is worth remembering — see [ScanSettings].
  final subscription = bus.events.listen((event) {
    if (event.source == ScanSource.hardware) {
      ref.read(hardwareSeenProvider.notifier).remember();
    }
  });
  ref.onDispose(subscription.cancel);
  return bus;
});

enum HomeTab { session, lookup, inventory, settings }

/// Which tab of the home screen is in front. The tabs live in an IndexedStack,
/// so they all stay mounted and all hear every scan — a screen has to know it
/// is the one the operator is looking at before it reacts to one.
class ActiveTab extends Notifier<HomeTab> {
  @override
  HomeTab build() => HomeTab.session;

  void select(HomeTab tab) => state = tab;
}

final activeTabProvider = NotifierProvider<ActiveTab, HomeTab>(ActiveTab.new);

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

  /// Enter demo mode: stored like any other pairing, so everything downstream
  /// — the home screen, sign-out, the API client — treats it as one.
  Future<void> startDemo() => save(baseUrl: demoBaseUrl, token: _demoToken);

  /// Drop the token but keep the server address — re-pairing the same device
  /// shouldn't mean reading the QR again. Leaving the demo drops the address
  /// too: `demo://` is no use in the server field.
  Future<void> signOut() async {
    final baseUrl = state.value?.baseUrl;
    await _storage.delete(key: _kToken);
    if (isDemo(baseUrl)) {
      await _storage.delete(key: _kBaseUrl);
      state = const AsyncData(Credentials());
      return;
    }
    state = AsyncData(Credentials(baseUrl: baseUrl));
  }
}

/// Stands in for a session token so [Credentials.isPaired] holds. Nothing ever
/// sends it: in demo mode no request leaves the device.
const _demoToken = 'demo';

final credentialsProvider = AsyncNotifierProvider<CredentialsNotifier, Credentials>(
  CredentialsNotifier.new,
);

/// Scanner broadcast configuration, editable in settings.
class ScannerConfigNotifier extends AsyncNotifier<ScannerConfig> {
  FlutterSecureStorage get _storage => ref.read(storageProvider);

  /// Watches the mode rather than the whole of [scanSettingsProvider] so that
  /// remembering a hardware sighting doesn't re-register the receiver.
  bool get _enabled => ref.watch(scanModeProvider).value != ScanMode.camera;

  @override
  Future<ScannerConfig> build() async {
    final raw = await _storage.read(key: _kScannerConfig);
    final config = raw == null
        ? ScannerConfig.defaults
        : ScannerConfig.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    await _apply(config);
    return config;
  }

  Future<void> save(ScannerConfig config) async {
    await _storage.write(key: _kScannerConfig, value: jsonEncode(config.toJson()));
    await _apply(config);
    state = AsyncData(config);
  }

  Future<void> _apply(ScannerConfig config) {
    final channel = ref.read(scanChannelProvider);
    return _enabled ? channel.configure(config) : channel.stop();
  }
}

final scannerConfigProvider = AsyncNotifierProvider<ScannerConfigNotifier, ScannerConfig>(
  ScannerConfigNotifier.new,
);

/// The operator's override of how this device scans.
class ScanModeNotifier extends AsyncNotifier<ScanMode> {
  FlutterSecureStorage get _storage => ref.read(storageProvider);

  @override
  Future<ScanMode> build() async => ScanMode.parse(await _storage.read(key: _kScanMode));

  Future<void> save(ScanMode mode) async {
    await _storage.write(key: _kScanMode, value: mode.name);
    state = AsyncData(mode);
  }
}

final scanModeProvider = AsyncNotifierProvider<ScanModeNotifier, ScanMode>(
  ScanModeNotifier.new,
);

/// Whether this device has ever produced a hardware scan. Kept apart from
/// [scanModeProvider] on purpose: it flips while a scan is being delivered, and
/// [scannerConfigProvider] must not tear the broadcast receiver down at that
/// exact moment just because the two happened to share a notifier.
class HardwareSeenNotifier extends AsyncNotifier<bool> {
  FlutterSecureStorage get _storage => ref.read(storageProvider);

  @override
  Future<bool> build() async => await _storage.read(key: _kHardwareSeen) == 'true';

  Future<void> remember() async {
    if (state.value ?? false) return;
    state = const AsyncData(true);
    await _storage.write(key: _kHardwareSeen, value: 'true');
  }

  /// Forget the observation, so "automatic" can settle again from scratch —
  /// the way out if the device is reconfigured or the setting was reached by a
  /// stray broadcast.
  Future<void> forget() async {
    state = const AsyncData(false);
    await _storage.delete(key: _kHardwareSeen);
  }
}

final hardwareSeenProvider = AsyncNotifierProvider<HardwareSeenNotifier, bool>(
  HardwareSeenNotifier.new,
);

/// The language the app is pinned to, or null to follow the device.
///
/// The web keeps this in a cookie that defaults to German regardless of the
/// browser. A phone is more personal than a browser profile, so the default
/// here is the device language and German is only the fallback when the device
/// asks for something we don't have.
class LocaleNotifier extends AsyncNotifier<Locale?> {
  FlutterSecureStorage get _storage => ref.read(storageProvider);

  @override
  Future<Locale?> build() async {
    final code = await _storage.read(key: _kLocale);
    return code == null ? null : Locale(code);
  }

  Future<void> save(Locale? locale) async {
    if (locale == null) {
      await _storage.delete(key: _kLocale);
    } else {
      await _storage.write(key: _kLocale, value: locale.languageCode);
    }
    state = AsyncData(locale);
  }
}

final localeProvider = AsyncNotifierProvider<LocaleNotifier, Locale?>(LocaleNotifier.new);

/// What this device calls itself, so a known PDA model can be trigger-first
/// from first launch instead of from first scan.
final deviceIdentityProvider = FutureProvider<DeviceIdentity?>(
  (ref) => ref.watch(scanChannelProvider).deviceInfo(),
);

/// How this device scans, once the stored answers are in. Defaults apply while
/// they load, which is the same thing they mean when there is nothing stored.
final scanSettingsProvider = Provider<ScanSettings>((ref) {
  return ScanSettings(
    mode: ref.watch(scanModeProvider).value ?? ScanMode.auto,
    hardwareSeen: ref.watch(hardwareSeenProvider).value ?? false,
    device: ref.watch(deviceIdentityProvider).value,
  );
});

/// Whether this install is running the store-review demo rather than talking to
/// a server. Screens use it to say so on screen — a demo that doesn't announce
/// itself is just a confusing app.
final isDemoProvider = Provider<bool>(
  (ref) => isDemo(ref.watch(credentialsProvider).value?.baseUrl),
);

/// The demo warehouse, kept for as long as the app runs, so a scan the reviewer
/// makes is still there on the next screen.
final demoBackendProvider = Provider<DemoBackend>((ref) => DemoBackend());

/// An API client for whatever we're currently paired with. Rebuilt whenever the
/// credentials change, so signing out invalidates every dependent request.
final apiClientProvider = Provider<ApiClient?>((ref) {
  final creds = ref.watch(credentialsProvider).value;
  if (creds?.baseUrl == null) return null;
  if (isDemo(creds!.baseUrl)) return demoApiClient(ref.watch(demoBackendProvider));
  return ApiClient(
    baseUrl: creds.baseUrl!,
    token: creds.token,
    userAgent: ref.watch(_userAgentProvider),
  );
});

/// The session the web lists as a connected device is created during pairing,
/// so the agent string has to be right on *this* client, not just the one used
/// afterwards. The model may still be resolving; a missing one costs the label
/// its detail, never the identification.
final _userAgentProvider = Provider<String>(
  (ref) => scannerUserAgent(ref.watch(deviceIdentityProvider).value?.label),
);

/// A client for pairing, before any token exists.
final pairingApiProvider = Provider.family<ApiClient, String>(
  (ref, baseUrl) => ApiClient(baseUrl: baseUrl, userAgent: ref.watch(_userAgentProvider)),
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

/// Equipment categories. Global rather than per-organization, and the server
/// already returns them in display order.
final categoriesProvider = FutureProvider<List<Category>>(
  (ref) => _requireApi(ref).inventory.listCategories(),
);
