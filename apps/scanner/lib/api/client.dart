import 'package:dio/dio.dart';
import 'package:flutter_riverpod/misc.dart';

import '../l10n/generated/app_localizations.dart';
import 'generated/export.dart';

/// A failure the server described. [code] is the machine-readable identifier —
/// `asset_not_found`, or RFC 8628's `authorization_pending` — which the device
/// flow branches on; [message] is what to show a person.
class ApiException implements Exception {
  const ApiException({required this.code, required this.message, this.status});

  final String code;
  final String message;
  final int? status;

  bool get isUnauthorized => status == 401;

  @override
  String toString() => message;
}

/// Thin hand-written wrapper around the generated clients: base URL, the bearer
/// header, and turning the API's error envelopes into [ApiException].
class ApiClient {
  ApiClient({required String baseUrl, String? token, Dio? dio}) : _dio = dio ?? Dio() {
    _dio.options
      ..baseUrl = baseUrl
      ..connectTimeout = const Duration(seconds: 10)
      ..receiveTimeout = const Duration(seconds: 20)
      // Handle every status ourselves so error bodies can be read out.
      ..validateStatus = (_) => true;
    _token = token;

    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          final t = _token;
          if (t != null) options.headers['Authorization'] = 'Bearer $t';
          handler.next(options);
        },
        onResponse: (response, handler) {
          final status = response.statusCode ?? 0;
          if (status >= 400) {
            handler.reject(
              DioException(
                requestOptions: response.requestOptions,
                error: _exceptionFrom(response),
                response: response,
              ),
            );
            return;
          }
          handler.next(response);
        },
      ),
    );

    identity = IdentityClient(_dio);
    inventory = InventoryClient(_dio);
    scanning = ScanningClient(_dio);
    auth = AuthClient(_dio);
  }

  final Dio _dio;
  String? _token;

  late final IdentityClient identity;
  late final InventoryClient inventory;
  late final ScanningClient scanning;
  late final AuthClient auth;

  Dio get raw => _dio;
  String get baseUrl => _dio.options.baseUrl;
  set token(String? value) => _token = value;

  /// /api/v1 answers {error: {code, message}}; the device endpoints answer
  /// RFC 8628's {error, error_description}. Both are handled so the operator
  /// sees the server's own wording rather than a bare status code.
  static ApiException _exceptionFrom(Response<dynamic> response) {
    final status = response.statusCode;
    final data = response.data;

    if (data is Map) {
      final err = data['error'];
      if (err is Map) {
        return ApiException(
          code: err['code'] as String? ?? 'unknown',
          message: err['message'] as String? ?? 'HTTP $status',
          status: status,
        );
      }
      if (err is String) {
        return ApiException(
          code: err,
          message: data['error_description'] as String? ?? err,
          status: status,
        );
      }
      if (data['message'] is String) {
        return ApiException(
          code: data['code'] as String? ?? 'unknown',
          message: data['message'] as String,
          status: status,
        );
      }
    }
    return ApiException(
      code: status == 401 ? 'unauthorized' : 'unknown',
      message: 'HTTP $status',
      status: status,
    );
  }
}

/// The message to show for a failure.
///
/// The API stays language-neutral — that is what the stable `code` is for — so
/// the wording lives in the catalogues and is resolved here. An unrecognised
/// code falls back to the server's own message rather than to something
/// generic: it may explain a case we haven't anticipated, and English detail
/// beats a translated shrug.
String describeError(S l10n, Object error) {
  final err = unwrapError(error);
  if (err is! ApiException) return err.toString();

  return switch (err.code) {
    'asset_not_found' => l10n.errorAssetNotFound,
    'forbidden' => l10n.errorForbidden,
    'wrong_organization' => l10n.errorWrongOrganization,
    'unauthorized' => l10n.errorUnauthorized,
    'invalid_request' => l10n.errorInvalidRequest,
    'invalid_limit' => l10n.errorInvalidLimit,
    'network' => l10n.errorNetwork,
    'internal_error' => l10n.errorInternal,
    'no_token' => l10n.errorNoToken,
    _ => err.message,
  };
}

/// Unwraps whatever Dio or Riverpod wrapped so callers can branch on
/// [ApiException].
///
/// Riverpod 3 wraps errors rethrown by a provider in [ProviderException], and
/// nests them when providers depend on each other, so peel those first —
/// otherwise every `is ApiException` check silently stops matching.
Object unwrapError(Object raw) {
  var error = raw;
  while (error is ProviderException) {
    error = error.exception;
  }

  if (error is DioException) {
    final inner = error.error;
    if (inner is ApiException) return inner;
    if (error.type == DioExceptionType.connectionTimeout ||
        error.type == DioExceptionType.receiveTimeout ||
        error.type == DioExceptionType.connectionError) {
      return const ApiException(code: 'network', message: 'Server nicht erreichbar');
    }
    return ApiException(code: 'network', message: error.message ?? 'Netzwerkfehler');
  }
  return error;
}
