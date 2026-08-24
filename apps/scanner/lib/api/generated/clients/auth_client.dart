// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/api_auth_device_approve_request_body.dart';
import '../models/api_auth_sign_in_email_request_body.dart';
import '../models/device_code_request.dart';
import '../models/device_code_response.dart';
import '../models/device_token_request.dart';
import '../models/device_token_response.dart';
import '../models/post_api_auth_device_approve_response.dart';
import '../models/sign_in_response.dart';

part 'auth_client.g.dart';

@RestApi()
abstract class AuthClient {
  factory AuthClient(Dio dio, {String? baseUrl}) = _AuthClient;

  /// Start the device authorization flow
  @POST('/api/auth/device/code')
  Future<DeviceCodeResponse> requestDeviceCode({
    @Body() required DeviceCodeRequest body,
  });

  /// Exchange an approved device code for a session token.
  ///
  /// Poll no faster than the `interval` from the code response. Until the.
  /// user approves, this answers 400 with `error: authorization_pending`;.
  /// polling too fast answers `slow_down`; an expired code answers.
  /// `expired_token`; a denied one `access_denied`.
  @POST('/api/auth/device/token')
  Future<DeviceTokenResponse> pollDeviceToken({
    @Body() required DeviceTokenRequest body,
  });

  /// Approve a pending device code (browser, signed in).
  ///
  /// Requires a signed-in session cookie, and the session must already have.
  /// claimed the code via `GET /api/auth/device?user_code=...`. Used by the.
  /// web UI, not by the device.
  @POST('/api/auth/device/approve')
  Future<PostApiAuthDeviceApproveResponse> approveDeviceCode({
    @Body() required ApiAuthDeviceApproveRequestBody body,
  });

  /// Sign in with email and password.
  ///
  /// The session token is returned in the `set-auth-token` response header.
  /// Native clients must read it from there.
  @POST('/api/auth/sign-in/email')
  Future<SignInResponse> signInWithEmail({
    @Body() required ApiAuthSignInEmailRequestBody body,
  });
}
