package com.raagavan.vedicclock

import android.content.Context
import android.content.Intent
import android.util.Log
import android.webkit.JavascriptInterface

/**
 * `window.AndroidAlarms` in the page (see js/android-bridge.js). Calls arrive on a WebView
 * background thread, which is fine: everything here is file work and AlarmManager.
 */
class AlarmBridge(private val ctx: Context) {
    @JavascriptInterface
    fun version(): Int = 1

    /** The page has started properly (see MainActivity's boot check). */
    @JavascriptInterface
    fun booted() { MainActivity.booted = true }

    /** The page's full schedule: the next rings of every enabled alarm, as concrete times. */
    @JavascriptInterface
    fun sync(json: String) {
        try {
            AlarmScheduler.onSync(ctx, json)
        } catch (e: Exception) {
            Log.e(TAG, "Bad schedule from the page", e)
        }
    }

    /** Alarms rung natively that the page has not recorded yet: [{alarmId, fireAtMs, rangAtMs}]. */
    @JavascriptInterface
    fun getRang(): String = Store.rangJson(ctx)

    @JavascriptInterface
    fun ackRang(upToRangAtMs: Double) = Store.ackRang(ctx, upToRangAtMs.toLong())

    // The person's own track, copied in base64 chunks so a big file never crosses the bridge in one go.
    @JavascriptInterface
    fun trackBegin(name: String) = Store.trackBegin(ctx, name)

    @JavascriptInterface
    fun trackChunk(base64: String) = Store.trackChunk(ctx, base64)

    @JavascriptInterface
    fun trackEnd() = Store.trackEnd(ctx)

    @JavascriptInterface
    fun clearTrack() = Store.trackClear(ctx)

    /** Today's panchanga for the lock-screen notification (see LockClock). */
    @JavascriptInterface
    fun setLockClock(json: String) {
        try {
            LockClock.setStatus(ctx, json)
        } catch (e: Exception) {
            Log.e(TAG, "Bad lock clock status from the page", e)
        }
    }

    /** Opens the "Make alarms reliable" checklist. */
    @JavascriptInterface
    fun openSetup() {
        ctx.startActivity(Intent(ctx, SetupActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    companion object {
        private const val TAG = "VedicAlarms"
    }
}
