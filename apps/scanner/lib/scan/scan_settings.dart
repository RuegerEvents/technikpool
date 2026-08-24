import 'scan_channel.dart';

/// Which input the app scans with.
enum ScanMode {
  /// Work it out per device — see [ScanSettings].
  auto,

  /// Only the built-in scan engine.
  hardware,

  /// Only the camera.
  camera;

  static ScanMode parse(String? name) =>
      ScanMode.values.where((mode) => mode.name == name).firstOrNull ?? ScanMode.auto;
}

/// What an Android device calls itself, from `Build`.
class DeviceIdentity {
  const DeviceIdentity({
    required this.manufacturer,
    required this.brand,
    required this.model,
  });

  final String manufacturer;
  final String brand;
  final String model;

  /// Handhelds confirmed to ship a hardware scan engine.
  ///
  /// Sunmi build every model in their range around one, so the manufacturer is
  /// enough. Chainway's C90 is matched by model as well as by maker, because
  /// resellers rebrand it — Munbyn sell the same hardware under their own name,
  /// and the model string is what survives that.
  ///
  /// This list only moves the *starting* answer. It is not the mechanism: a PDA
  /// that isn't on it still switches to trigger-first the moment it delivers
  /// its first scan, so a device missing here costs one tap, never the feature.
  bool get isKnownPda {
    final maker = '$manufacturer $brand'.toLowerCase();
    if (maker.contains('sunmi') || maker.contains('chainway')) return true;
    return model.toLowerCase().contains('c90');
  }

  /// How to name this device to a person — in Settings, and in the web's
  /// "Connected devices" list, which is where someone picks one handheld out of
  /// several to disconnect. Some makers already repeat themselves in the model
  /// ("Sunmi L2"), so only prefix the maker when it isn't there already.
  String get label {
    final name = model.trim();
    if (manufacturer.isEmpty) return name;
    if (name.toLowerCase().startsWith(manufacturer.toLowerCase())) return name;
    return '$manufacturer $name'.trim();
  }

  @override
  String toString() => label;
}

/// How this particular device scans.
///
/// The hard part is deciding this before the operator has scanned anything.
/// Android has no API that answers "does this device have a barcode engine":
/// the engine is a vendor service that broadcasts Intents, invisible until it
/// fires. So the answer is assembled from two sources, in order of how much
/// they can be trusted:
///
///  * [hardwareSeen] — this device has actually delivered a scan. Proof, and
///    it outlives any list we maintain.
///  * [DeviceIdentity.isKnownPda] — the model is one we know ships an engine.
///    A head start for the devices in the warehouse today, so a C90 is
///    trigger-first from first launch rather than after first scan.
///
/// Neither is a guess about a device we've never met: anything unrecognised
/// gets the camera, which is the right answer for a phone and recoverable
/// everywhere else.
class ScanSettings {
  const ScanSettings({this.mode = ScanMode.auto, this.hardwareSeen = false, this.device});

  final ScanMode mode;

  /// Whether a hardware scan has ever arrived on this device.
  final bool hardwareSeen;

  /// Null on iOS, and until the platform answers.
  final DeviceIdentity? device;

  bool get isKnownPda => device?.isKnownPda ?? false;

  /// [mode] with [ScanMode.auto] resolved for this device.
  ScanMode get effectiveMode => switch (mode) {
    ScanMode.hardware || ScanMode.camera => mode,
    ScanMode.auto =>
      ScanChannel.isSupported && (isKnownPda || hardwareSeen)
          ? ScanMode.hardware
          : ScanMode.camera,
  };

  /// Whether the UI offers the camera at all. False on a handheld with a real
  /// trigger, where a camera button is only ever a mis-tap.
  bool get cameraEnabled => effectiveMode == ScanMode.camera;

  ScanSettings copyWith({ScanMode? mode, bool? hardwareSeen, DeviceIdentity? device}) =>
      ScanSettings(
        mode: mode ?? this.mode,
        hardwareSeen: hardwareSeen ?? this.hardwareSeen,
        device: device ?? this.device,
      );
}
