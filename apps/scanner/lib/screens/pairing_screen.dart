import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/auth_service.dart';
import '../api/client.dart';
import '../l10n/strings.dart';
import '../state/providers.dart';

enum _Step { server, deviceCode, password }

/// First-run pairing. The server address is read with the hardware scanner off
/// the QR on the web app's Scanners page — no URL typing on a rugged keypad —
/// and then the operator either approves a short code in a browser (default) or
/// signs in with a password.
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
    // The same hardware trigger that reads asset tags reads the setup QR, so
    // no camera plugin is needed anywhere in this app.
    _scanSub = ref.read(scanChannelProvider).scans.listen((code) {
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
        _error = describeError(error);
        _busy = false;
      });
    }
  }

  Future<void> _awaitApproval(AuthService auth, PendingDeviceAuth pending) async {
    try {
      final token = await auth.awaitApproval(
        pending,
        cancelled: () => _cancelled || !mounted,
      );
      if (!mounted) return;
      await ref.read(credentialsProvider.notifier).save(baseUrl: _baseUrl, token: token);
    } on DeviceAuthDenied {
      if (mounted) setState(() => _error = S.accessDenied);
    } on DeviceAuthExpired {
      if (mounted) setState(() => _error = S.codeExpired);
    } catch (error) {
      if (mounted) setState(() => _error = describeError(error));
    }
  }

  Future<void> _signInWithPassword() async {
    final url = _normalisedUrl();
    if (url.isEmpty) return;

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
        _error = describeError(error);
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
    return Scaffold(
      appBar: AppBar(title: const Text(S.connectTitle)),
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

  Widget _serverStep() => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      const Text(S.scanServerQr, style: TextStyle(fontSize: 16)),
      const SizedBox(height: 20),
      TextField(
        controller: _urlController,
        keyboardType: TextInputType.url,
        autocorrect: false,
        decoration: const InputDecoration(
          labelText: S.serverAddress,
          hintText: S.serverAddressHint,
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
            : const Text(S.continueLabel),
      ),
      const SizedBox(height: 8),
      TextButton(
        onPressed: _busy
            ? null
            : () => setState(() {
                _step = _Step.password;
                _error = null;
              }),
        child: const Text(S.signInWithPassword),
      ),
    ],
  );

  Widget _deviceCodeStep() {
    final pending = _pending;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Text(S.codeInstructions, style: TextStyle(fontSize: 16)),
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
          style: TextStyle(color: Theme.of(context).colorScheme.outline),
        ),
        const SizedBox(height: 24),
        if (_error != null)
          _errorBox(_error!)
        else
          const Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              SizedBox(
                height: 18,
                width: 18,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
              SizedBox(width: 12),
              Text(S.waitingForApproval),
            ],
          ),
        const SizedBox(height: 24),
        OutlinedButton(onPressed: _restart, child: const Text(S.startOver)),
      ],
    );
  }

  Widget _passwordStep() => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      TextField(
        controller: _urlController,
        keyboardType: TextInputType.url,
        autocorrect: false,
        decoration: const InputDecoration(labelText: S.serverAddress),
      ),
      const SizedBox(height: 14),
      TextField(
        controller: _emailController,
        keyboardType: TextInputType.emailAddress,
        autocorrect: false,
        decoration: const InputDecoration(labelText: S.email),
      ),
      const SizedBox(height: 14),
      TextField(
        controller: _passwordController,
        obscureText: true,
        decoration: const InputDecoration(labelText: S.password),
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
            : const Text(S.signIn),
      ),
      const SizedBox(height: 8),
      TextButton(
        onPressed: _busy
            ? null
            : () => setState(() {
                _step = _Step.server;
                _error = null;
              }),
        child: const Text(S.useDeviceCode),
      ),
    ],
  );

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
