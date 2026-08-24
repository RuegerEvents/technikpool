package events.rueger.technikpool.technikpool_scanner

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import io.flutter.plugin.common.EventChannel
import io.flutter.plugin.common.MethodChannel

/**
 * Bridges the PDA's hardware barcode engine into Dart.
 *
 * Munbyn (and the other Android PDAs built on the same ODM firmware) can be set
 * to emit scans either as a keyboard wedge or as a broadcast Intent. Broadcast
 * is what we want, but the action string and the extra key holding the decoded
 * text vary by model and firmware — there is no single correct pair to
 * hardcode. So the actions and keys are supplied from Dart at registration
 * time, and the diagnostics mode reports everything that arrives so the real
 * values can be discovered on the device itself.
 */
class ScanReceiver(private val context: Context) {

    /** Decoded scans, as plain strings. */
    val scanStream = object : EventChannel.StreamHandler {
        override fun onListen(arguments: Any?, events: EventChannel.EventSink) {
            scanSink = events
        }

        override fun onCancel(arguments: Any?) {
            scanSink = null
        }
    }

    /**
     * Every broadcast received while diagnostics is on, as
     * {action, extras: {key: value}} — the honest way to find out what a given
     * device actually emits.
     */
    val diagnosticStream = object : EventChannel.StreamHandler {
        override fun onListen(arguments: Any?, events: EventChannel.EventSink) {
            diagnosticSink = events
        }

        override fun onCancel(arguments: Any?) {
            diagnosticSink = null
        }
    }

    private var scanSink: EventChannel.EventSink? = null
    private var diagnosticSink: EventChannel.EventSink? = null

    private var actions: List<String> = emptyList()
    private var extraKeys: List<String> = emptyList()
    private var registered = false

    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(ctx: Context?, intent: Intent?) {
            if (intent == null) return

            diagnosticSink?.success(
                mapOf(
                    "action" to (intent.action ?: ""),
                    "extras" to (intent.extras?.let { bundle ->
                        bundle.keySet().associateWith { key ->
                            @Suppress("DEPRECATION")
                            bundle.get(key)?.toString() ?: ""
                        }
                    } ?: emptyMap<String, String>())
                )
            )

            val barcode = extraKeys
                .firstNotNullOfOrNull { key -> intent.getStringExtra(key)?.takeIf { it.isNotBlank() } }
            // Some firmwares put the payload in a byte array rather than a string.
                ?: extraKeys
                    .firstNotNullOfOrNull { key ->
                        intent.getByteArrayExtra(key)?.toString(Charsets.UTF_8)?.takeIf { it.isNotBlank() }
                    }

            if (barcode != null) scanSink?.success(barcode.trim())
        }
    }

    /** (Re)register for the given actions. Safe to call repeatedly. */
    fun configure(actions: List<String>, extraKeys: List<String>, result: MethodChannel.Result) {
        this.actions = actions
        this.extraKeys = extraKeys
        unregister()

        if (actions.isNotEmpty()) {
            val filter = IntentFilter().apply { actions.forEach { addAction(it) } }
            // Scanner broadcasts come from another app on the device, so the
            // receiver has to be exported on Android 13+.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                context.registerReceiver(receiver, filter, Context.RECEIVER_EXPORTED)
            } else {
                @Suppress("UnspecifiedRegisterReceiverFlag")
                context.registerReceiver(receiver, filter)
            }
            registered = true
        }
        result.success(null)
    }

    fun unregister() {
        if (!registered) return
        runCatching { context.unregisterReceiver(receiver) }
        registered = false
    }
}
