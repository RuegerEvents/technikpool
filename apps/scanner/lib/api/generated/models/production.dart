// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'organization.dart';
import 'production_checkout_role.dart';

part 'production.g.dart';

@JsonSerializable()
class Production {
  const Production({
    required this.id,
    required this.name,
    required this.organization,
    this.startDate,
    this.endDate,
    this.checkoutRole,
    this.canCheck,
  });
  
  factory Production.fromJson(Map<String, Object?> json) => _$ProductionFromJson(json);
  
  final String id;
  final String name;
  final DateTime? startDate;
  final DateTime? endDate;
  final Organization organization;

  /// `production`: a member of the org that runs it — anything can be.
  /// checked out to it. `lender`: it has the caller's org's units booked.
  /// and approved, and only those can be. `none`: read only.
  ///
  final ProductionCheckoutRole? checkoutRole;

  /// Whether the caller may check its list — crew may, without booking rights.
  final bool? canCheck;

  Map<String, Object?> toJson() => _$ProductionToJson(this);
}
