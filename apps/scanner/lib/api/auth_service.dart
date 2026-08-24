import 'dart:async';

import 'package:dio/dio.dart';

import 'client.dart';
import 'generated/export.dart';

/// What the device shows while it waits for someone to approve it.
class PendingDeviceAuth {
  const PendingDeviceAuth({
    required this.deviceCode,
    required this.userCode,
    required this.verificationUri,
    required this.interval,
    required this.expiresAt,
  });

  final String deviceCode;
  final String userCode;
  final String verificationUri;
  final Duration interval;
  final DateTime expiresAt;

  /// Grouped in fours — far easier to read off a small screen and type.
  String get formattedUserCode {
    final bare = userCode.replaceAll(RegExp(r'[\s-]'), '');
    if (bare.length <= 4) return bare;
    return '${bare.substring(0, 4)}-${bare.substring(4)}';
  }
}

class DeviceAuthDenied implements Exception {}

class DeviceAuthExpired implements Exception {}

const _clientId = 'technikpool-scanner';
const _deviceCodeGrantType = 'urn:ietf:params:oauth:grant-type:device_code';

/// Both ways of getting a session token. They differ only in how the token is
/// obtained; everything afterwards is identical.
class AuthService {
  AuthService(this._api);

  final ApiClient _api;

  /// Step one of the device flow: ask for a code to display.
  Future<PendingDeviceAuth> requestDeviceCode() async {
    final res = await _api.auth.requestDeviceCode(
      body: const DeviceCodeRequest(clientId: _clientId),
    );
    return PendingDeviceAuth(
      deviceCode: res.deviceCode,
      userCode: res.userCode,
      verificationUri: res.verificationUri,
      interval: Duration(seconds: res.interval),
      expiresAt: DateTime.now().add(Duration(seconds: res.expiresIn)),
    );
  }

  /// Step two: poll until approved, denied or expired.
  ///
  /// The server enforces the interval and answers `slow_down` if we poll too
  /// fast, so back off rather than hammering it — a device that ignores this
  /// never gets a token.
  Future<String> awaitApproval(
    PendingDeviceAuth pending, {
    required bool Function() cancelled,
  }) async {
    var delay = pending.interval;

    while (!cancelled()) {
      await Future<void>.delayed(delay);
      if (cancelled()) break;

      if (DateTime.now().isAfter(pending.expiresAt)) throw DeviceAuthExpired();

      try {
        final res = await _api.auth.pollDeviceToken(
          body: DeviceTokenRequest(
            grantType: _deviceCodeGrantType,
            deviceCode: pending.deviceCode,
            clientId: _clientId,
          ),
        );
        return res.accessToken;
      } catch (error) {
        final err = unwrapError(error);
        if (err is! ApiException) rethrow;

        switch (err.code) {
          case 'authorization_pending':
            break;
          case 'slow_down':
            delay += const Duration(seconds: 5);
          case 'access_denied':
            throw DeviceAuthDenied();
          case 'expired_token':
            throw DeviceAuthExpired();
          default:
            rethrow;
        }
      }
    }
    throw DeviceAuthDenied();
  }

  /// Password sign-in. The session token comes back in the `set-auth-token`
  /// response header rather than the body — better-auth's bearer plugin puts it
  /// there precisely so non-browser clients can pick it up — so this uses raw
  /// Dio; the generated client only surfaces the body.
  Future<String> signInWithPassword({
    required String email,
    required String password,
  }) async {
    final response = await _api.raw.post<dynamic>(
      '/api/auth/sign-in/email',
      data: {'email': email, 'password': password},
      options: Options(headers: {'content-type': 'application/json'}),
    );

    final header = response.headers.value('set-auth-token');
    if (header != null && header.isNotEmpty) return header;

    // Older better-auth versions returned it in the body; harmless to accept.
    final data = response.data;
    if (data is Map && data['token'] is String) return data['token'] as String;

    throw const ApiException(
      code: 'no_token',
      // Codes carry the meaning and describeError does the wording; this is
      // only the fallback shown if that mapping ever misses.
      message: 'The server returned no session token.',
    );
  }
}
