package events.rueger.technikpool.technikpool_scanner

import android.os.Build
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.EventChannel
import io.flutter.plugin.common.MethodChannel

private const val METHOD_CHANNEL = "technikpool/scanner"
private const val SCAN_CHANNEL = "technikpool/scanner/scans"
private const val DIAGNOSTIC_CHANNEL = "technikpool/scanner/diagnostics"

class MainActivity : FlutterActivity() {

    private var scanReceiver: ScanReceiver? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        val receiver = ScanReceiver(applicationContext)
        scanReceiver = receiver

        val messenger = flutterEngine.dartExecutor.binaryMessenger

        EventChannel(messenger, SCAN_CHANNEL).setStreamHandler(receiver.scanStream)
        EventChannel(messenger, DIAGNOSTIC_CHANNEL).setStreamHandler(receiver.diagnosticStream)

        MethodChannel(messenger, METHOD_CHANNEL).setMethodCallHandler { call, result ->
            when (call.method) {
                "configure" -> receiver.configure(
                    call.argument<List<String>>("actions").orEmpty(),
                    call.argument<List<String>>("extraKeys").orEmpty(),
                    result
                )

                // Who this device says it is. The only use is recognising the
                // PDA models we know ship a scan engine, so the app can lead
                // with the trigger before the first scan has proved anything.
                "deviceInfo" -> result.success(
                    mapOf(
                        "manufacturer" to Build.MANUFACTURER,
                        "brand" to Build.BRAND,
                        "model" to Build.MODEL,
                    )
                )

                "stop" -> {
                    receiver.unregister()
                    result.success(null)
                }

                else -> result.notImplemented()
            }
        }
    }

    override fun onDestroy() {
        scanReceiver?.unregister()
        scanReceiver = null
        super.onDestroy()
    }
}
