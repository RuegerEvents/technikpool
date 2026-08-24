import 'dart:async';

import 'package:flutter/services.dart';

/// A broadcast configuration: which Intent actions to listen for and which
/// extras carry the decoded text.
class ScannerConfig {
  const ScannerConfig({required this.actions, required this.extraKeys});

  final List<String> actions;
  final List<String> extraKeys;

  /// Starting guesses only. Android PDAs from different vendors — and different
  /// firmware revisions of the same model — use different action strings and
  /// extra keys, so these are seeds for the settings screen, not facts. Use the
  /// diagnostics screen on the actual device to find the real pair.
  static const defaults = ScannerConfig(
    actions: [
      'com.scanner.broadcast',
      'android.intent.ACTION_DECODE_DATA',
      'com.rfid.SCAN',
      'nlscan.action.SCANNER_RESULT',
    ],
    extraKeys: ['data', 'barcode_string', 'barcode', 'SCAN_BARCODE1', 'value'],
  );

  ScannerConfig copyWith({List<String>? actions, List<String>? extraKeys}) =>
      ScannerConfig(
        actions: actions ?? this.actions,
        extraKeys: extraKeys ?? this.extraKeys,
      );

  Map<String, dynamic> toJson() => {'actions': actions, 'extraKeys': extraKeys};

  static ScannerConfig fromJson(Map<String, dynamic> json) => ScannerConfig(
    actions: (json['actions'] as List?)?.cast<String>() ?? defaults.actions,
    extraKeys: (json['extraKeys'] as List?)?.cast<String>() ?? defaults.extraKeys,
  );
}

/// One raw broadcast, for the diagnostics screen.
class DiagnosticEvent {
  const DiagnosticEvent({required this.action, required this.extras});

  final String action;
  final Map<String, String> extras;
}

/// Talks to the Kotlin BroadcastReceiver. Everything the hardware trigger
/// produces arrives on [scans].
class ScanChannel {
  static const _method = MethodChannel('technikpool/scanner');
  static const _scans = EventChannel('technikpool/scanner/scans');
  static const _diagnostics = EventChannel('technikpool/scanner/diagnostics');

  StreamController<String>? _scanController;
  StreamSubscription<dynamic>? _platformSubscription;

  /// Decoded barcodes, fanned out to however many screens are listening.
  ///
  /// The platform stream is subscribed exactly once and never cancelled.
  /// EventChannel.receiveBroadcastStream() builds a *new* controller on every
  /// call and re-fires the platform's onListen/onCancel, so subscribing per
  /// screen meant the newest listener replaced the Kotlin sink and the first
  /// screen disposed cleared it for everyone — scanning silently died as soon
  /// as the pairing screen went away.
  Stream<String> get scans {
    final controller = _scanController ??= StreamController<String>.broadcast();
    _platformSubscription ??= _scans.receiveBroadcastStream().listen(
      (event) => controller.add(event as String),
      onError: controller.addError,
    );
    return controller.stream;
  }

  Stream<DiagnosticEvent> get diagnostics => _diagnostics.receiveBroadcastStream().map((
    event,
  ) {
    final map = (event as Map).cast<Object?, Object?>();
    return DiagnosticEvent(
      action: map['action'] as String? ?? '',
      extras: (map['extras'] as Map?)?.map((k, v) => MapEntry('$k', '$v')) ?? const {},
    );
  });

  Future<void> configure(ScannerConfig config) =>
      _method.invokeMethod<void>('configure', config.toJson());

  Future<void> stop() => _method.invokeMethod<void>('stop');
}
