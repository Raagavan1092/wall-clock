package com.raagavan.vedicclock

import android.app.AlarmManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.util.Log
import android.widget.RemoteViews
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * The widgets (time, tithi, nakshatra) for the home screen and, on phones that offer lock screen
 * widgets, the lock screen. The page works out the panchanga and hands over the next few days of it
 * ([setStatus]); the widgets pick what holds right now, so they stay right with the app closed.
 * The ghati and pala are counted here from sunrise (1 ghati = 24 minutes). The widgets are redrawn
 * every minute by an inexact alarm, and only while at least one widget is placed.
 */
object ClockWidgets {
    private const val PREF_STATUS = "widget_status"
    const val ACTION_REFRESH = "com.raagavan.vedicclock.WIDGETS"
    private const val REFRESH_MS = 60_000L
    private const val GHATI_MS = 24 * 60_000L
    private const val TAG = "VedicWidgets"

    private val IST: TimeZone = TimeZone.getTimeZone("Asia/Kolkata")

    /** {sunrises:[ms...], tithis:[{n,e}...], nakshatras:[{n,e}...]}: each name holds until its end `e` (ms). */
    fun setStatus(ctx: Context, json: String) {
        JSONObject(json) // reject garbage before storing it
        Store.prefs(ctx).edit().putString(PREF_STATUS, json).apply()
        updateAll(ctx)
    }

    private fun providers() = listOf(TimeWidget::class.java, TithiWidget::class.java, NakshatraWidget::class.java)

    fun updateAll(ctx: Context, now: Long = System.currentTimeMillis()) {
        try {
            val mgr = AppWidgetManager.getInstance(ctx)
            val status = Store.prefs(ctx).getString(PREF_STATUS, null)?.let { runCatching { JSONObject(it) }.getOrNull() }
            var any = false
            for (cls in providers()) {
                val ids = mgr.getAppWidgetIds(ComponentName(ctx, cls))
                if (ids.isEmpty()) continue
                any = true
                for (id in ids) mgr.updateAppWidget(id, views(ctx, cls, status, now))
            }
            val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            if (any) am.setAndAllowWhileIdle(AlarmManager.RTC, now + REFRESH_MS, refreshIntent(ctx)) else am.cancel(refreshIntent(ctx))
        } catch (e: Exception) {
            Log.e(TAG, "Could not update the widgets", e)
        }
    }

    private fun refreshIntent(ctx: Context): PendingIntent = PendingIntent.getBroadcast(
        ctx, 3, Intent(ctx, AlarmReceiver::class.java).setAction(ACTION_REFRESH),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    private fun open(ctx: Context): PendingIntent = PendingIntent.getActivity(
        ctx, 14, Intent(ctx, MainActivity::class.java), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    private fun views(ctx: Context, cls: Class<*>, status: JSONObject?, now: Long): RemoteViews {
        val v: RemoteViews
        when (cls) {
            TimeWidget::class.java -> {
                v = RemoteViews(ctx.packageName, R.layout.widget_time)
                v.setTextViewText(R.id.w_ghati, ghatiText(status, now))
            }
            TithiWidget::class.java -> {
                v = RemoteViews(ctx.packageName, R.layout.widget_panchanga)
                fill(v, "Tithi", status?.optJSONArray("tithis"), now)
            }
            else -> {
                v = RemoteViews(ctx.packageName, R.layout.widget_panchanga)
                fill(v, "Nakṣatra", status?.optJSONArray("nakshatras"), now)
            }
        }
        v.setOnClickPendingIntent(R.id.w_root, open(ctx))
        return v
    }

    private fun hhmm(ms: Long) = SimpleDateFormat("HH:mm", Locale.US).apply { timeZone = IST }.format(Date(ms))

    /** "20 Jun 14:32" style when the end is not today, else just the time. */
    private fun when_(ms: Long, now: Long): String {
        val day = SimpleDateFormat("yyyyMMdd", Locale.US).apply { timeZone = IST }
        return if (day.format(Date(ms)) == day.format(Date(now))) hhmm(ms)
        else SimpleDateFormat("d MMM", Locale.US).apply { timeZone = IST }.format(Date(ms)) + " " + hhmm(ms)
    }

    /** "Ghaṭī 12 · Pala 34", counted from the latest sunrise that has passed; "Open the app" when unknown. */
    internal fun ghatiText(s: JSONObject?, now: Long): String {
        val arr = s?.optJSONArray("sunrises") ?: return "Open the app"
        var sunrise = -1L
        var next = -1L
        for (i in 0 until arr.length()) {
            val t = arr.optLong(i)
            if (t <= now) sunrise = t else { next = t; break }
        }
        // Past the last known sunrise by a day or more (or none yet): the count would be wrong.
        if (sunrise < 0 || (next < 0 && now - sunrise >= 26 * 3600_000L)) return "Open the app"
        val since = now - sunrise
        return "Ghaṭī ${(since / GHATI_MS) % 60} · Pala ${(since % GHATI_MS) * 60 / GHATI_MS}"
    }

    /** What holds now, when it ends (= when the next starts) and the next one's name. */
    internal fun current(list: JSONArray?, now: Long): Triple<String, Long, String?>? {
        if (list == null) return null
        for (i in 0 until list.length()) {
            val o = list.optJSONObject(i) ?: continue
            val end = o.optLong("e")
            if (end > now) return Triple(o.optString("n"), end, list.optJSONObject(i + 1)?.optString("n"))
        }
        return null
    }

    private fun fill(v: RemoteViews, title: String, list: JSONArray?, now: Long) {
        v.setTextViewText(R.id.w_title, title)
        val c = current(list, now)
        if (c == null) {
            v.setTextViewText(R.id.w_name, "Open the app")
            v.setTextViewText(R.id.w_till, "to refresh")
            v.setTextViewText(R.id.w_next, "")
            return
        }
        v.setTextViewText(R.id.w_name, c.first)
        v.setTextViewText(R.id.w_till, "Next starts " + when_(c.second, now))
        v.setTextViewText(R.id.w_next, if (c.third.isNullOrEmpty()) "" else "Then " + c.third)
    }
}

abstract class ClockWidgetProvider : AppWidgetProvider() {
    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) = ClockWidgets.updateAll(context)
    override fun onEnabled(context: Context) = ClockWidgets.updateAll(context)
    override fun onDisabled(context: Context) = ClockWidgets.updateAll(context)
}

class TimeWidget : ClockWidgetProvider()
class TithiWidget : ClockWidgetProvider()
class NakshatraWidget : ClockWidgetProvider()
