import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'api/client.dart';
import 'l10n/strings.dart';
import 'screens/home_screen.dart';
import 'screens/pairing_screen.dart';
import 'state/providers.dart';

/// Riverpod 3 retries failed providers automatically. That's genuinely useful
/// on a warehouse PDA drifting in and out of wifi, but only for failures that
/// might succeed on a second attempt: retrying a 401 or a 404 just burns
/// battery and hammers the server. Retry transport failures and 5xx, give up on
/// anything the client did wrong.
Duration? _retry(int attempt, Object error) {
  final err = unwrapError(error);
  if (err is ApiException) {
    final status = err.status;
    final retryable = err.code == 'network' || (status != null && status >= 500);
    if (!retryable) return null;
  }
  if (attempt >= 5) return null;
  return Duration(seconds: 1 << attempt); // 1s, 2s, 4s, 8s, 16s
}

void main() {
  runApp(ProviderScope(retry: _retry, child: const ScannerApp()));
}

class ScannerApp extends StatelessWidget {
  const ScannerApp({super.key});

  @override
  Widget build(BuildContext context) {
    final scheme = ColorScheme.fromSeed(
      seedColor: const Color(0xFF0069C9),
      brightness: Brightness.light,
    );
    return MaterialApp(
      title: S.appTitle,
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: scheme,
        useMaterial3: true,
        // Warehouse use: gloves, poor light, arm's length. Bigger touch targets
        // and text than the Material defaults.
        filledButtonTheme: FilledButtonThemeData(
          style: FilledButton.styleFrom(
            minimumSize: const Size.fromHeight(52),
            textStyle: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600),
          ),
        ),
        outlinedButtonTheme: OutlinedButtonThemeData(
          style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(52)),
        ),
        inputDecorationTheme: const InputDecorationTheme(
          border: OutlineInputBorder(),
          contentPadding: EdgeInsets.symmetric(horizontal: 14, vertical: 18),
        ),
      ),
      home: const _Root(),
    );
  }
}

class _Root extends ConsumerWidget {
  const _Root();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final creds = ref.watch(credentialsProvider);
    // Registers the broadcast receiver as soon as the app starts (a no-op on
    // platforms with no such thing), and opens the scan bus so a trigger pull
    // is noticed even before a screen has asked to listen.
    ref.watch(scannerConfigProvider);
    ref.watch(scanBusProvider);

    return creds.when(
      loading: () => const Scaffold(body: Center(child: CircularProgressIndicator())),
      error: (err, _) => Scaffold(body: Center(child: Text('$err'))),
      data: (c) => c.isPaired ? const HomeScreen() : const PairingScreen(),
    );
  }
}
