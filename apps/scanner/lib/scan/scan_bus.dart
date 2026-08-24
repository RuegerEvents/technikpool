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

  /// When each code was last let through. Keyed by the code rather than just
  /// remembering the previous one: with the camera pointed at a shelf, A B A
  /// comes back inside a second, and the B in the middle must not make the
  /// second A look new.
  final _lastAccepted = <String, DateTime>{};

  /// A hardware trigger commonly fires twice on one pull — milliseconds apart,
  /// and anything longer is the operator deliberately pulling again.
  static const _hardwareEchoWindow = Duration(seconds: 2);

  /// The camera re-reads the same label on every frame it stays in view, and a
  /// label stays in view for as long as it takes to move the phone. Ten seconds
  /// is the operator's own pace: long enough that a shelf can be worked through
  /// without the same sticker landing twice, short enough that deliberately
  /// coming back to one isn't a fight.
  static const _cameraEchoWindow = Duration(seconds: 10);

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
  ///
  /// Returns whether the code was passed on, so a caller showing a running
  /// count doesn't count the echoes it can't see.
  bool add(String raw, ScanSource source) {
    final code = raw.trim();
    if (code.isEmpty) return false;

    final now = DateTime.now();
    // Prune on the longest window, so the map stays bounded over a long session
    // without expiring an entry either window still cares about.
    _lastAccepted.removeWhere((_, at) => now.difference(at) > _cameraEchoWindow);

    final window = source == ScanSource.camera ? _cameraEchoWindow : _hardwareEchoWindow;
    final last = _lastAccepted[code];
    if (last != null && now.difference(last) < window) return false;
    _lastAccepted[code] = now;

    _controller.add(ScanEvent(code: code, source: source));
    return true;
  }

  Future<void> dispose() async {
    await _hardwareSubscription?.cancel();
    await _controller.close();
  }
}
