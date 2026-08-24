import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'l10n/strings.dart';
import 'screens/home_screen.dart';
import 'screens/pairing_screen.dart';
import 'state/providers.dart';

void main() {
  runApp(const ProviderScope(child: ScannerApp()));
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
    // Registers the broadcast receiver as soon as the app starts.
    ref.watch(scannerConfigProvider);

    return creds.when(
      loading: () => const Scaffold(body: Center(child: CircularProgressIndicator())),
      error: (err, _) => Scaffold(body: Center(child: Text('$err'))),
      data: (c) => c.isPaired ? const HomeScreen() : const PairingScreen(),
    );
  }
}
