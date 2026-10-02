package events.rueger.technikpool.technikpool_scanner

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
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

                // A scan's answer, felt. Not Flutter's HapticFeedback: that is a
                // keyboard tick, which Android drops whenever "vibrate on touch"
                // is off in the system settings — on most phones, that is.
                "vibrate" -> {
                    vibrate(call.argument<List<Int>>("pattern").orEmpty())
                    result.success(null)
                }

                "stop" -> {
                    receiver.unregister()
                    result.success(null)
                }

                else -> result.notImplemented()
            }
        }
    }

    /** [pattern] alternates off and on times in milliseconds, starting with off. */
    private fun vibrate(pattern: List<Int>) {
        if (pattern.size < 2) return
        val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            (getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        }
        if (!vibrator.hasVibrator()) return
        val timings = pattern.map { it.toLong() }.toLongArray()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator.vibrate(VibrationEffect.createWaveform(timings, -1))
        } else {
            @Suppress("DEPRECATION")
            vibrator.vibrate(timings, -1)
        }
    }

    override fun onDestroy() {
        scanReceiver?.unregister()
        scanReceiver = null
        super.onDestroy()
    }
}
