// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/current_user.dart';
import '../models/legal_link.dart';

part 'identity_client.g.dart';

@RestApi()
abstract class IdentityClient {
  factory IdentityClient(Dio dio, {String? baseUrl}) = _IdentityClient;

  /// The authenticated user and their organizations.
  ///
  /// Also the cheapest way for a client to check whether its stored token is.
  /// still valid — a 401 here means unpair and sign in again.
  @GET('/api/v1/me')
  Future<CurrentUser> getCurrentUser();

  /// The server operator's imprint, privacy policy and terms.
  ///
  /// Whatever the operator has set up, in the order imprint, privacy, terms;.
  /// a page they haven't set up is left out, so the list may be empty. Each.
  /// `url` is absolute and opens in a browser: either the operator's own site.
  /// or a page on this server. Needs no token, like the pages themselves.
  @GET('/api/v1/legal')
  Future<List<LegalLink>> listLegalLinks();
}
