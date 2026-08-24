import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../l10n/strings.dart';
import '../state/providers.dart';
import '../theme.dart';
import 'scan_bus.dart';

/// What the screen that opened the camera made of one code. Shown over the
/// preview so the operator gets the same confirmation the session list gives,
/// without having to close the camera to read it.
class CameraScanFeedback {
  const CameraScanFeedback({required this.ok, required this.title, required this.detail});

  final bool ok;
  final String title;
  final String detail;
}

/// Asset stickers are DataMatrix (see the web app's sticker generator) and the
/// pairing code is a QR. The linear formats are here for labels that predate
/// the sticker printer — restricting the list at all is what keeps decoding
/// fast enough to feel like a trigger pull.
const _assetFormats = <BarcodeFormat>[
  BarcodeFormat.dataMatrix,
  BarcodeFormat.qrCode,
  BarcodeFormat.code128,
  BarcodeFormat.code39,
  BarcodeFormat.ean13,
  BarcodeFormat.ean8,
];

/// The camera as a scan engine, for every device that hasn't got a real one.
///
/// It reads codes into [ScanBus] rather than returning them, so the screens
/// behind it react to a camera scan through exactly the same path as a trigger
/// pull — there is no second code path to keep in step.
class CameraScanScreen extends ConsumerStatefulWidget {
  const CameraScanScreen({
    super.key,
    required this.title,
    this.continuous = false,
    this.feedback,
    this.formats = _assetFormats,
  });

  final String title;

  /// Stay open after a hit, so a whole shelf can be worked through in one go.
  /// Otherwise the screen closes on the first code it reads.
  final bool continuous;

  /// Results from whoever is consuming the scans, if they report any.
  final Stream<CameraScanFeedback>? feedback;

  final List<BarcodeFormat> formats;

  /// Read one code with the camera. Returns once the camera closes; the code
  /// itself arrives through [ScanBus], like any other scan.
  static Future<void> once(
    BuildContext context, {
    required String title,
    List<BarcodeFormat> formats = _assetFormats,
  }) => Navigator.of(context).push<void>(
    MaterialPageRoute(
      builder: (_) => CameraScanScreen(title: title, formats: formats),
    ),
  );

  @override
  ConsumerState<CameraScanScreen> createState() => _CameraScanScreenState();
}

class _CameraScanScreenState extends ConsumerState<CameraScanScreen> {
  late final MobileScannerController _controller = MobileScannerController(
    formats: widget.formats,
    // A DataMatrix sticker is small and read close up; letting the camera zoom
    // itself is the difference between "works" and "hold it exactly here".
    autoZoom: true,
    detectionTimeoutMs: 250,
  );

  StreamSubscription<CameraScanFeedback>? _feedbackSub;
  CameraScanFeedback? _last;
  int _count = 0;
  bool _closing = false;

  @override
  void initState() {
    super.initState();
    _feedbackSub = widget.feedback?.listen((feedback) {
      if (mounted) setState(() => _last = feedback);
    });
  }

  @override
  void dispose() {
    _feedbackSub?.cancel();
    _controller.dispose();
    super.dispose();
  }

  void _onDetect(BarcodeCapture capture) {
    // Detection keeps firing while the pop animation runs; without this the
    // screen would pop the route underneath it too.
    if (_closing) return;

    final code = capture.barcodes
        .map((barcode) => barcode.rawValue)
        .firstWhere(
          (value) => value != null && value.trim().isNotEmpty,
          orElse: () => null,
        );
    if (code == null) return;

    ref.read(scanBusProvider).add(code, ScanSource.camera);

    if (!widget.continuous) {
      _closing = true;
      Navigator.of(context).maybePop();
      return;
    }
    setState(() => _count++);
  }

  String _describe(MobileScannerException error) => switch (error.errorCode) {
    MobileScannerErrorCode.permissionDenied => S.cameraDenied,
    MobileScannerErrorCode.unsupported => S.cameraUnsupported,
    _ => S.cameraFailed,
  };

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      // The app bar floats over the preview rather than sitting on a surface.
      appBar: AppBar(
        title: Text(widget.title),
        actions: [
          ValueListenableBuilder<MobileScannerState>(
            valueListenable: _controller,
            builder: (_, state, _) {
              if (state.torchState == TorchState.unavailable) {
                return const SizedBox.shrink();
              }
              return IconButton(
                tooltip: S.torch,
                onPressed: _controller.toggleTorch,
                icon: Icon(
                  state.torchState == TorchState.on
                      ? Icons.flashlight_on
                      : Icons.flashlight_off,
                ),
              );
            },
          ),
        ],
      ),
      body: Stack(
        fit: StackFit.expand,
        children: [
          LayoutBuilder(
            builder: (context, constraints) {
              final size = constraints.biggest;
              final window = Rect.fromCenter(
                center: size.center(Offset.zero),
                width: size.shortestSide * 0.75,
                height: size.shortestSide * 0.75,
              );
              return Stack(
                fit: StackFit.expand,
                children: [
                  MobileScanner(
                    controller: _controller,
                    scanWindow: window,
                    onDetect: _onDetect,
                    errorBuilder: (context, error) => Center(
                      child: Padding(
                        padding: const EdgeInsets.all(32),
                        child: Text(
                          _describe(error),
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            color: OverlayColors.foreground,
                            fontSize: 16,
                          ),
                        ),
                      ),
                    ),
                  ),
                  ScanWindowOverlay(
                    controller: _controller,
                    scanWindow: window,
                    borderRadius: BorderRadius.circular(16),
                    borderColor: OverlayColors.guide,
                  ),
                ],
              );
            },
          ),
          Positioned(left: 0, right: 0, bottom: 0, child: _banner()),
        ],
      ),
    );
  }

  Widget _banner() {
    final last = _last;
    return SafeArea(
      child: Container(
        margin: const EdgeInsets.all(16),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        decoration: BoxDecoration(
          color: switch (last) {
            null => OverlayColors.scrim,
            CameraScanFeedback(ok: true) => OverlayColors.success,
            _ => OverlayColors.error,
          },
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          children: [
            Icon(
              last == null
                  ? Icons.qr_code_scanner
                  : last.ok
                  ? Icons.check_circle
                  : Icons.error,
              color: OverlayColors.foreground,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    last?.title ?? S.cameraHint,
                    style: const TextStyle(
                      color: OverlayColors.foreground,
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  if (last != null && last.detail.isNotEmpty)
                    Text(
                      last.detail,
                      style: const TextStyle(
                        color: OverlayColors.mutedForeground,
                        fontSize: 13,
                      ),
                    ),
                ],
              ),
            ),
            if (widget.continuous) ...[
              const SizedBox(width: 12),
              Text(
                '$_count',
                style: const TextStyle(
                  color: OverlayColors.foreground,
                  fontSize: 20,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
