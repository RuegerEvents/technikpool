import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../api/auth_service.dart';
import '../api/client.dart';
import '../l10n/generated/app_localizations.dart';
import '../scan/camera_scan_screen.dart';
import '../state/providers.dart';

enum _Step { server, deviceCode, password }

/// First-run pairing. The server address is read off the QR on the web app's
/// Scanners page — with the hardware trigger on a PDA, with the camera on a
/// phone, either way no URL typing on a rugged keypad — and then the operator
/// either approves a short code in a browser (default) or signs in with a
/// password.
class PairingScreen extends ConsumerStatefulWidget {
  const PairingScreen({super.key});

  @override
  ConsumerState<PairingScreen> createState() => _PairingScreenState();
}

class _PairingScreenState extends ConsumerState<PairingScreen> {
  final _urlController = TextEditingController();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();

  StreamSubscription<String>? _scanSub;
  _Step _step = _Step.server;
  String _baseUrl = '';
  PendingDeviceAuth? _pending;
  String? _error;
  bool _busy = false;
  bool _cancelled = false;

  @override
  void initState() {
    super.initState();
    // Whatever reads asset tags on this device reads the setup QR too.
    _scanSub = ref.read(scanBusProvider).codes.listen((code) {
      if (!mounted || _step != _Step.server) return;
      final trimmed = code.trim();
      if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        _urlController.text = trimmed;
        _startDeviceFlow();
      }
    });

    ref.read(credentialsProvider.future).then((c) {
      if (mounted && c.baseUrl != null) _urlController.text = c.baseUrl!;
    });
  }

  @override
  void dispose() {
    _cancelled = true;
    _scanSub?.cancel();
    _urlController.dispose();
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  String _normalisedUrl() {
    var url = _urlController.text.trim();
    if (url.isEmpty) return '';
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://$url';
    }
    return url.endsWith('/') ? url.substring(0, url.length - 1) : url;
  }

  Future<void> _startDeviceFlow() async {
    final url = _normalisedUrl();
    if (url.isEmpty) return;

    // Read before the awaits below: this resumes after a round trip.
    final l10n = S.of(context);

    setState(() {
      _baseUrl = url;
      _busy = true;
      _error = null;
      _cancelled = false;
    });

    final auth = ref.read(authServiceProvider(url));
    try {
      final pending = await auth.requestDeviceCode();
      if (!mounted) return;
      setState(() {
        _pending = pending;
        _step = _Step.deviceCode;
        _busy = false;
      });
      await _awaitApproval(auth, pending);
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = describeError(l10n, error);
        _busy = false;
      });
    }
  }

  Future<void> _awaitApproval(AuthService auth, PendingDeviceAuth pending) async {
    final l10n = S.of(context);
    try {
      final token = await auth.awaitApproval(
        pending,
        cancelled: () => _cancelled || !mounted,
      );
      if (!mounted) return;
      await ref.read(credentialsProvider.notifier).save(baseUrl: _baseUrl, token: token);
    } on DeviceAuthDenied {
      if (mounted) setState(() => _error = l10n.accessDenied);
    } on DeviceAuthExpired {
      if (mounted) setState(() => _error = l10n.codeExpired);
    } catch (error) {
      if (mounted) setState(() => _error = describeError(l10n, error));
    }
  }

  Future<void> _signInWithPassword() async {
    final url = _normalisedUrl();
    if (url.isEmpty) return;

    final l10n = S.of(context);

    setState(() {
      _busy = true;
      _error = null;
    });

    try {
      final token = await ref
          .read(authServiceProvider(url))
          .signInWithPassword(
            email: _emailController.text.trim(),
            password: _passwordController.text,
          );
      if (!mounted) return;
      await ref.read(credentialsProvider.notifier).save(baseUrl: url, token: token);
    } catch (error) {
      if (!mounted) return;
      // Surface better-auth's own wording — an unverified address produces a
      // specific message the operator needs to read, not "login failed".
      setState(() {
        _error = describeError(l10n, error);
        _busy = false;
      });
    }
  }

  void _restart() {
    setState(() {
      _cancelled = true;
      _pending = null;
      _error = null;
      _busy = false;
      _step = _Step.server;
    });
  }

  @override
  Widget build(BuildContext context) {
    final l10n = S.of(context);
    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.connectTitle),
        // The language setting proper lives under Settings, which is behind
        // pairing — so it is unreachable exactly when someone who cannot read
        // the device's language needs it. The web keeps its switcher in the
        // header on every page for the same reason.
        actions: [
          // Language codes rather than Locale?, with '' for "follow the
          // device". A PopupMenuItem whose value is null is indistinguishable
          // from dismissing the menu, so PopupMenuButton reports it as a
          // cancel and onSelected never fires — the system option looked like
          // it worked and silently did nothing.
          PopupMenuButton<String>(
            icon: const Icon(Icons.language),
            tooltip: l10n.language,
            initialValue: ref.watch(localeProvider).value?.languageCode ?? '',
            onSelected: (code) =>
                ref.read(localeProvider.notifier).save(code.isEmpty ? null : Locale(code)),
            itemBuilder: (_) => [
              PopupMenuItem(value: '', child: Text(l10n.languageSystem)),
              // Endonyms: someone hunting for their own language scans for the
              // word they would write, not its translation.
              for (final locale in S.supportedLocales)
                PopupMenuItem(
                  value: locale.languageCode,
                  child: Text(switch (locale.languageCode) {
                    'de' => 'Deutsch',
                    'en' => 'English',
                    _ => locale.languageCode,
                  }),
                ),
            ],
          ),
        ],
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: switch (_step) {
            _Step.server => _serverStep(),
            _Step.deviceCode => _deviceCodeStep(),
            _Step.password => _passwordStep(),
          },
        ),
      ),
    );
  }

  Widget _serverStep() {
    final l10n = S.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(l10n.scanServerQr, style: TextStyle(fontSize: 16)),
        if (ref.watch(scanSettingsProvider).cameraEnabled) ...[
          const SizedBox(height: 16),
          OutlinedButton.icon(
            onPressed: _busy
                ? null
                : () => CameraScanScreen.once(
                    context,
                    title: l10n.scanQrWithCamera,
                    formats: const [BarcodeFormat.qrCode],
                  ),
            icon: const Icon(Icons.photo_camera_outlined),
            label: Text(l10n.scanQrWithCamera),
          ),
        ],
        const SizedBox(height: 20),
        TextField(
          controller: _urlController,
          keyboardType: TextInputType.url,
          autocorrect: false,
          decoration: InputDecoration(
            labelText: l10n.serverAddress,
            hintText: l10n.serverAddressHint,
          ),
        ),
        const SizedBox(height: 20),
        if (_error != null) _errorBox(_error!),
        FilledButton(
          onPressed: _busy ? null : _startDeviceFlow,
          child: _busy
              ? const SizedBox(
                  height: 22,
                  width: 22,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : Text(l10n.continueLabel),
        ),
        const SizedBox(height: 8),
        TextButton(
          onPressed: _busy
              ? null
              : () => setState(() {
                  _step = _Step.password;
                  _error = null;
                }),
          child: Text(l10n.signInWithPassword),
        ),
        const Divider(height: 32),
        // App-store reviewers have no Technikpool server to pair with, so the
        // way in has to be on the screen that would otherwise stop them.
        Text(
          l10n.demoExplainer,
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 12, color: Theme.of(context).colorScheme.onSurfaceVariant),
        ),
        const SizedBox(height: 8),
        OutlinedButton.icon(
          onPressed: _busy ? null : () => ref.read(credentialsProvider.notifier).startDemo(),
          icon: const Icon(Icons.science_outlined),
          label: Text(l10n.demoStart),
        ),
      ],
    );
  }

  Widget _deviceCodeStep() {
    final l10n = S.of(context);
    final pending = _pending;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(l10n.codeInstructions, style: TextStyle(fontSize: 16)),
        const SizedBox(height: 24),
        Container(
          padding: const EdgeInsets.symmetric(vertical: 28),
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.surfaceContainerHighest,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Center(
            child: Text(
              pending?.formattedUserCode ?? '',
              style: const TextStyle(
                fontSize: 40,
                fontWeight: FontWeight.bold,
                letterSpacing: 4,
                fontFamily: 'monospace',
              ),
            ),
          ),
        ),
        const SizedBox(height: 16),
        Text(
          pending?.verificationUri ?? '',
          textAlign: TextAlign.center,
          style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant),
        ),
        const SizedBox(height: 24),
        if (_error != null)
          _errorBox(_error!)
        else
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              SizedBox(
                height: 18,
                width: 18,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
              SizedBox(width: 12),
              Text(l10n.waitingForApproval),
            ],
          ),
        const SizedBox(height: 24),
        OutlinedButton(onPressed: _restart, child: Text(l10n.startOver)),
      ],
    );
  }

  Widget _passwordStep() {
    final l10n = S.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          controller: _urlController,
          keyboardType: TextInputType.url,
          autocorrect: false,
          decoration: InputDecoration(labelText: l10n.serverAddress),
        ),
        const SizedBox(height: 14),
        TextField(
          controller: _emailController,
          keyboardType: TextInputType.emailAddress,
          autocorrect: false,
          decoration: InputDecoration(labelText: l10n.email),
        ),
        const SizedBox(height: 14),
        TextField(
          controller: _passwordController,
          obscureText: true,
          decoration: InputDecoration(labelText: l10n.password),
          onSubmitted: (_) => _signInWithPassword(),
        ),
        const SizedBox(height: 20),
        if (_error != null) _errorBox(_error!),
        FilledButton(
          onPressed: _busy ? null : _signInWithPassword,
          child: _busy
              ? const SizedBox(
                  height: 22,
                  width: 22,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : Text(l10n.signIn),
        ),
        const SizedBox(height: 8),
        TextButton(
          onPressed: _busy
              ? null
              : () => setState(() {
                  _step = _Step.server;
                  _error = null;
                }),
          child: Text(l10n.useDeviceCode),
        ),
      ],
    );
  }

  Widget _errorBox(String message) => Container(
    margin: const EdgeInsets.only(bottom: 16),
    padding: const EdgeInsets.all(14),
    decoration: BoxDecoration(
      color: Theme.of(context).colorScheme.errorContainer,
      borderRadius: BorderRadius.circular(8),
    ),
    child: Text(
      message,
      style: TextStyle(color: Theme.of(context).colorScheme.onErrorContainer),
    ),
  );
}
