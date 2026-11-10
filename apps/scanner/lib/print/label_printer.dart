import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:dio/dio.dart';

import '../api/generated/export.dart';

/// Where the label printer is on the network.
///
/// A thermal printer with Ethernet listens for raw print data on port 9100
/// (JetDirect / "raw TCP"), so printing is opening a socket and writing the
/// label's ZPL into it — no driver, no spooler, no protocol on top. The server
/// renders the label and never talks to the printer itself: it usually runs
/// somewhere the warehouse network cannot be reached from, while this device
/// is on that network.
class LabelPrinterConfig {
  const LabelPrinterConfig({required this.host, this.port = defaultPort});

  static const defaultPort = 9100;

  final String host;
  final int port;

  /// `host` or `host:port`, as typed into Settings. Null when there is no host.
  static LabelPrinterConfig? parse(String input) {
    final trimmed = input.trim();
    if (trimmed.isEmpty) return null;
    final colon = trimmed.lastIndexOf(':');
    // A bare IPv6 address has colons of its own and no port.
    if (colon > 0 && trimmed.indexOf(':') == colon) {
      final port = int.tryParse(trimmed.substring(colon + 1));
      if (port == null || port <= 0 || port > 65535) return null;
      return LabelPrinterConfig(host: trimmed.substring(0, colon), port: port);
    }
    return LabelPrinterConfig(host: trimmed);
  }

  @override
  String toString() => port == defaultPort ? host : '$host:$port';
}

/// Why a print did not go out.
class LabelPrintException implements Exception {
  const LabelPrintException(this.kind, [this.detail]);

  final LabelPrintFailure kind;
  final String? detail;

  @override
  String toString() => detail == null ? kind.name : '${kind.name}: $detail';
}

enum LabelPrintFailure { unreachable, timeout }

/// Writes [zpl] to the printer and closes the connection.
///
/// The printer acknowledges nothing over a raw port: a written and flushed
/// socket is as much confirmation as there is. Out of paper or an open lid
/// shows on the printer, not here.
Future<void> sendToPrinter(
  LabelPrinterConfig printer,
  String zpl, {
  Duration timeout = const Duration(seconds: 5),
}) async {
  Socket? socket;
  try {
    socket = await Socket.connect(printer.host, printer.port, timeout: timeout);
    socket.add(utf8.encode(zpl));
    await socket.flush().timeout(timeout);
  } on SocketException catch (e) {
    throw LabelPrintException(
      LabelPrintFailure.unreachable,
      e.osError?.message ?? e.message,
    );
  } on TimeoutException catch (_) {
    throw const LabelPrintException(LabelPrintFailure.timeout);
  } finally {
    await socket?.close().timeout(timeout, onTimeout: () => socket?.destroy());
  }
}

/// A label that proves the connection and shows the printer's alignment: a
/// frame along the edges of a 4×6″ label and a line of text. Not localised —
/// it is read once by whoever set the printer up.
const testLabelZpl =
    '^XA^CI28^PW813^LL1219^LH0,0'
    '^FO16,16^GB781,1187,4^FS'
    '^FO60,80^A0N,60,60^FDTechnikpool^FS'
    '^FO60,160^A0N,36,36^FDTestdruck / Test print^FS'
    '^FO60,220^BXN,12,200^FDTECHNIKPOOL-TEST^FS'
    '^XZ';

/// One label of [label] (a long one prints on several) rendered by Labelary's
/// online service, as the printer would print it. Sends the label's text to api.labelary.com, which is what the
/// preview is.
Future<Uint8List> labelaryPreview(CaseLabel label, {int index = 0, Dio? dio}) async {
  final client = dio ?? Dio();
  // The API takes the label size in inches only.
  String inches(num mm) => (mm / 25.4).toStringAsFixed(4);
  final url =
      'https://api.labelary.com/v1/printers/${label.dpmm}dpmm/labels/'
      '${inches(label.widthMm)}x${inches(label.heightMm)}/$index/';
  final response = await client.post<List<int>>(
    url,
    data: label.zpl,
    options: Options(
      contentType: 'application/x-www-form-urlencoded',
      headers: {'Accept': 'image/png'},
      responseType: ResponseType.bytes,
      sendTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 15),
    ),
  );
  return Uint8List.fromList(response.data ?? const []);
}
