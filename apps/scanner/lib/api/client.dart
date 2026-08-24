import 'package:dio/dio.dart';

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

/// German text for the error codes the API defines. The API itself stays
/// language-neutral — that's what the stable `code` is for — so localisation
/// happens here rather than on the server.
const _germanMessages = <String, String>{
  'asset_not_found': 'Dieses Etikett ist unbekannt.',
  'forbidden': 'Kein Zugriff auf diesen Artikel.',
  'wrong_organization': 'Der Lagerort gehört zu einer anderen Organisation.',
  'unauthorized': 'Die Sitzung ist abgelaufen. Bitte erneut verbinden.',
  'invalid_request': 'Ungültige Anfrage.',
  'invalid_limit': 'Ungültige Seitengröße.',
  'network': 'Server nicht erreichbar.',
  'internal_error': 'Serverfehler.',
};

/// The message to show for a failure: the German text when the code is one we
/// know, otherwise the server's own wording — which is better than a generic
/// fallback, since it may explain something we haven't anticipated.
String localisedMessage(Object error) {
  final err = unwrapError(error);
  if (err is ApiException) return _germanMessages[err.code] ?? err.message;
  return err.toString();
}

/// Unwraps whatever Dio wrapped so callers can branch on [ApiException].
Object unwrapError(Object error) {
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

String describeError(Object error) => localisedMessage(error);
