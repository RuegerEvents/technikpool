import 'dart:async';

import 'scan_channel.dart';

/// Where a decoded barcode came from.
enum ScanSource {
  /// The device's own scan engine, via [ScanChannel]. Android PDAs only.
  hardware,

  /// The camera, via the in-app scanner screen. Every device has one of these.
  camera,
}

class ScanEvent {
  const ScanEvent({required this.code, required this.source});

  final String code;
  final ScanSource source;
}

/// The one place a decoded barcode enters the app, whichever input produced it.
///
/// Screens listen here instead of to [ScanChannel] directly, so the same screen
/// works on a rugged PDA with a trigger and on a phone with only a camera —
/// neither needs to know which it is running on.
class ScanBus {
  ScanBus(this._channel);

  final ScanChannel _channel;
  final _controller = StreamController<ScanEvent>.broadcast();
  StreamSubscription<String>? _hardwareSubscription;

  String? _lastCode;
  DateTime _lastAt = DateTime.fromMillisecondsSinceEpoch(0);

  /// A hardware trigger commonly fires twice on one pull, and the camera
  /// re-reads the same label on every frame it stays in view. Both are one
  /// scan as far as the operator is concerned, so the echo is dropped here
  /// rather than in each screen.
  static const _echoWindow = Duration(seconds: 2);

  Stream<ScanEvent> get events {
    _hardwareSubscription ??= _channel.scans.listen(
      (code) => add(code, ScanSource.hardware),
      onError: _controller.addError,
    );
    return _controller.stream;
  }

  /// Just the codes, for screens that don't care where a scan came from.
  Stream<String> get codes => events.map((event) => event.code);

  /// Feed a code in from the camera scanner.
  ///
  /// Typed entry deliberately does not come through here: repeating a tag by
  /// hand is something the operator meant to do, so it must not be swallowed
  /// as an echo.
  void add(String raw, ScanSource source) {
    final code = raw.trim();
    if (code.isEmpty) return;

    final now = DateTime.now();
    if (code == _lastCode && now.difference(_lastAt) < _echoWindow) return;
    _lastCode = code;
    _lastAt = now;

    _controller.add(ScanEvent(code: code, source: source));
  }

  Future<void> dispose() async {
    await _hardwareSubscription?.cancel();
    await _controller.close();
  }
}
