import 'dart:async';
import 'dart:io' show Platform;

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

import 'scan_settings.dart';

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

  ScannerConfig copyWith({List<String>? actions, List<String>? extraKeys}) => ScannerConfig(
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
///
/// Android only. A scan engine that announces itself over broadcast Intents is
/// an Android-PDA idea; nothing answers these channel names on iOS, where every
/// call would throw MissingPluginException. So each entry point checks
/// [isSupported] and degrades to nothing rather than to a crash, and the camera
/// carries the scanning wherever this is false.
class ScanChannel {
  static const _method = MethodChannel('technikpool/scanner');
  static const _scans = EventChannel('technikpool/scanner/scans');
  static const _diagnostics = EventChannel('technikpool/scanner/diagnostics');

  /// Whether this device could have a hardware scan engine behind these
  /// channels at all. Not whether it actually has one — no Android API
  /// reports that, so see [ScanSettings.hardwareSeen] for the answer that
  /// only the device itself can give.
  static bool get isSupported => !kIsWeb && Platform.isAndroid;

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
    if (!isSupported) return const Stream<String>.empty();
    final controller = _scanController ??= StreamController<String>.broadcast();
    _platformSubscription ??= _scans.receiveBroadcastStream().listen(
      (event) => controller.add(event as String),
      onError: controller.addError,
    );
    return controller.stream;
  }

  Stream<DiagnosticEvent> get diagnostics {
    if (!isSupported) return const Stream<DiagnosticEvent>.empty();
    return _diagnostics.receiveBroadcastStream().map((event) {
      final map = (event as Map).cast<Object?, Object?>();
      return DiagnosticEvent(
        action: map['action'] as String? ?? '',
        extras: (map['extras'] as Map?)?.map((k, v) => MapEntry('$k', '$v')) ?? const {},
      );
    });
  }

  Future<void> configure(ScannerConfig config) async {
    if (!isSupported) return;
    await _method.invokeMethod<void>('configure', config.toJson());
  }

  Future<void> stop() async {
    if (!isSupported) return;
    await _method.invokeMethod<void>('stop');
  }

  /// What this device calls itself. Null wherever there is no bridge to ask.
  Future<DeviceIdentity?> deviceInfo() async {
    if (!isSupported) return null;
    final map = await _method.invokeMapMethod<String, String>('deviceInfo');
    if (map == null) return null;
    return DeviceIdentity(
      manufacturer: map['manufacturer'] ?? '',
      brand: map['brand'] ?? '',
      model: map['model'] ?? '',
    );
  }
}
