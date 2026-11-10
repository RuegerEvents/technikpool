import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:technikpool_scanner/print/label_printer.dart';

void main() {
  group('LabelPrinterConfig.parse', () {
    test('takes a host, with or without a port', () {
      expect(LabelPrinterConfig.parse(' 192.168.1.50 ')?.port, 9100);
      final custom = LabelPrinterConfig.parse('printer.local:6101');
      expect(custom?.host, 'printer.local');
      expect(custom?.port, 6101);
      expect('${LabelPrinterConfig.parse('10.0.0.7:9100')}', '10.0.0.7');
    });

    test('refuses nothing and a broken port', () {
      expect(LabelPrinterConfig.parse(''), isNull);
      expect(LabelPrinterConfig.parse('10.0.0.7:abc'), isNull);
      expect(LabelPrinterConfig.parse('10.0.0.7:70000'), isNull);
    });
  });

  test('sends the ZPL as UTF-8 over a raw socket', () async {
    final server = await ServerSocket.bind(InternetAddress.loopbackIPv4, 0);
    final received = server.first.then((socket) => utf8.decodeStream(socket));
    await sendToPrinter(
      LabelPrinterConfig(host: '127.0.0.1', port: server.port),
      '^XA^FDGerätekiste^FS^XZ',
    );
    expect(await received, '^XA^FDGerätekiste^FS^XZ');
    await server.close();
  });

  test('a printer that is not there is reported, not thrown raw', () async {
    // Bind and close at once: a port nothing listens on.
    final probe = await ServerSocket.bind(InternetAddress.loopbackIPv4, 0);
    final port = probe.port;
    await probe.close();
    expect(
      sendToPrinter(LabelPrinterConfig(host: '127.0.0.1', port: port), '^XA^XZ'),
      throwsA(isA<LabelPrintException>()),
    );
  });
}
