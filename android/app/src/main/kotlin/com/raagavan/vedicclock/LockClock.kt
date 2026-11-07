package com.raagavan.vedicclock

import android.app.AlarmManager
import android.app.Notification
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * The clock on the lock screen, in two parts that the person turns on in "Make alarms reliable":
 *  - a quiet ongoing notification (public on the lock screen) showing ghati/pala, vara, tithi and
 *    nakshatra. The page works out the panchanga and hands over a status with [setStatus]; the ghati
 *    is counted here from sunrise (1 ghati = 24 minutes) so it stays right between updates;
 *  - MainActivity shows over the lock screen (PREF_SHOW_LOCKED), see there.
 * The notification is refreshed whenever the page pushes a status and, with the app closed, every
 * few minutes by an inexact alarm. Anything past its end time is dropped rather than shown stale.
 */
object LockClock {
    const val PREF_NOTIFY = "lock_clock_notify"
    const val PREF_SHOW_LOCKED = "show_when_locked"
    private const val PREF_STATUS = "lock_clock_status"
    const val ACTION_REFRESH = "com.raagavan.vedicclock.LOCK_CLOCK"
    const val ID = 1004
    private const val REFRESH_MS = 5 * 60_000L
    private const val GHATI_MS = 24 * 60_000L

    private val IST: TimeZone = TimeZone.getTimeZone("Asia/Kolkata")

    /** What the page knows: {sunriseMs, nextSunriseMs, vara, tithi, tithiEndMs, nakshatra, nakshatraEndMs}. */
    fun setStatus(ctx: Context, json: String) {
        JSONObject(json) // reject garbage before storing it
        Store.prefs(ctx).edit().putString(PREF_STATUS, json).apply()
        refresh(ctx)
    }

    fun enabled(ctx: Context) = Store.prefs(ctx).getBoolean(PREF_NOTIFY, false)

    fun setEnabled(ctx: Context, on: Boolean) {
        Store.prefs(ctx).edit().putBoolean(PREF_NOTIFY, on).apply()
        refresh(ctx)
    }

    /** Posts, updates or removes the notification, and arms (or cancels) the next refresh. */
    fun refresh(ctx: Context, now: Long = System.currentTimeMillis()) {
        val nm = Notifier.manager(ctx)
        val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val status = Store.prefs(ctx).getString(PREF_STATUS, null)?.let { runCatching { JSONObject(it) }.getOrNull() }
        val lines = if (enabled(ctx) && status != null) lines(status, now) else null
        if (lines == null) {
            nm.cancel(ID)
            am.cancel(refreshIntent(ctx))
            return
        }
        Notifier.ensureChannels(ctx)
        val n = Notification.Builder(ctx, Notifier.CHANNEL_CLOCK)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(lines.first)
            .setContentText(lines.second)
            .setStyle(Notification.BigTextStyle().bigText(lines.second))
            .setCategory(Notification.CATEGORY_STATUS)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .setContentIntent(PendingIntent.getActivity(ctx, 14, Intent(ctx, MainActivity::class.java), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
            .build()
        nm.notify(ID, n)
        am.setAndAllowWhileIdle(AlarmManager.RTC, now + REFRESH_MS, refreshIntent(ctx))
    }

    private fun refreshIntent(ctx: Context): PendingIntent = PendingIntent.getBroadcast(
        ctx, 3, Intent(ctx, AlarmReceiver::class.java).setAction(ACTION_REFRESH),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    private fun hhmm(ms: Long) = SimpleDateFormat("HH:mm", Locale.US).apply { timeZone = IST }.format(Date(ms))

    /** Title and body, or null when the status has run out (past the next sunrise). */
    internal fun lines(s: JSONObject, now: Long): Pair<String, String>? {
        val sunrise = s.optLong("sunriseMs", 0)
        val nextSunrise = s.optLong("nextSunriseMs", 0)
        if (sunrise <= 0 || now < sunrise || now >= nextSunrise) return null
        val sinceSunrise = now - sunrise
        val ghati = (sinceSunrise / GHATI_MS) % 60
        val pala = (sinceSunrise % GHATI_MS) * 60 / GHATI_MS
        val title = "Ghaṭī $ghati · Pala $pala · ${hhmm(now)}"
        val body = ArrayList<String>()
        val vara = s.optString("vara")
        val tithi = s.optString("tithi")
        if (tithi.isNotEmpty() && now < s.optLong("tithiEndMs")) {
            body.add((if (vara.isNotEmpty()) "$vara · " else "") + tithi + " till " + hhmm(s.optLong("tithiEndMs")))
        } else if (vara.isNotEmpty()) body.add(vara)
        val nak = s.optString("nakshatra")
        if (nak.isNotEmpty() && now < s.optLong("nakshatraEndMs")) body.add(nak + " till " + hhmm(s.optLong("nakshatraEndMs")))
        return title to body.joinToString("\n").ifEmpty { "Vedic clock" }
    }
}
