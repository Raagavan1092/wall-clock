package com.raagavan.vedicclock

import android.app.AlarmManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.os.Bundle
import android.util.Log
import android.widget.RemoteViews
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin

/**
 * The clock-face widget for the home screen and, on phones that offer lock screen widgets, the lock
 * screen: the dial's ghati scale and hand with the ghati, pala and time in the middle, drawn without
 * the outer rings. The page works out the sunrises and hands over the next few days of them
 * ([setStatus]); the face is redrawn here every minute by an inexact alarm (only while at least one
 * widget is placed), so it stays right with the app closed. 1 ghati = 24 minutes, counted from sunrise.
 */
object ClockWidgets {
    private const val PREF_STATUS = "widget_status"
    const val ACTION_REFRESH = "com.raagavan.vedicclock.WIDGETS"
    private const val REFRESH_MS = 60_000L
    private const val GHATI_MS = 24 * 60_000L
    private const val TAG = "VedicWidgets"

    private val IST: TimeZone = TimeZone.getTimeZone("Asia/Kolkata")

    /** {sunrises:[ms...], ...}: the page also sends tithis/nakshatras, which the face does not use. */
    fun setStatus(ctx: Context, json: String) {
        JSONObject(json) // reject garbage before storing it
        Store.prefs(ctx).edit().putString(PREF_STATUS, json).apply()
        updateAll(ctx)
    }

    fun updateAll(ctx: Context, now: Long = System.currentTimeMillis()) {
        try {
            val mgr = AppWidgetManager.getInstance(ctx)
            val status = Store.prefs(ctx).getString(PREF_STATUS, null)?.let { runCatching { JSONObject(it) }.getOrNull() }
            val ids = mgr.getAppWidgetIds(ComponentName(ctx, ClockFaceWidget::class.java))
            for (id in ids) mgr.updateAppWidget(id, views(ctx, mgr.getAppWidgetOptions(id), status, now))
            val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            if (ids.isNotEmpty()) am.setAndAllowWhileIdle(AlarmManager.RTC, now + REFRESH_MS, refreshIntent(ctx)) else am.cancel(refreshIntent(ctx))
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

    private fun views(ctx: Context, options: Bundle?, status: JSONObject?, now: Long): RemoteViews {
        // The face is a square picture sized to the widget (in px, kept modest: the launcher caps what a widget may carry).
        val density = ctx.resources.displayMetrics.density
        val wDp = options?.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0) ?: 0
        val hDp = options?.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0) ?: 0
        val dp = if (wDp > 0 && hDp > 0) min(wDp, hDp) else 110
        val px = (dp * density).toInt().coerceIn(96, 420)
        val v = RemoteViews(ctx.packageName, R.layout.widget_clock)
        v.setImageViewBitmap(R.id.w_face, drawFace(px, sinceSunrise(status, now), hhmm(now)))
        v.setOnClickPendingIntent(R.id.w_root, open(ctx))
        return v
    }

    private fun hhmm(ms: Long) = SimpleDateFormat("HH:mm", Locale.US).apply { timeZone = IST }.format(Date(ms))

    /** Milliseconds since the latest sunrise that has passed; null when unknown (no data, or too long since the last one). */
    internal fun sinceSunrise(s: JSONObject?, now: Long): Long? {
        val arr = s?.optJSONArray("sunrises") ?: return null
        var sunrise = -1L
        var next = -1L
        for (i in 0 until arr.length()) {
            val t = arr.optLong(i)
            if (t <= now) sunrise = t else { next = t; break }
        }
        // Past the last known sunrise by a day or more (or none yet): the count would be wrong.
        if (sunrise < 0 || (next < 0 && now - sunrise >= 26 * 3600_000L)) return null
        return now - sunrise
    }

    /** "Ghaṭī 12 · Pala 34", counted from the latest sunrise that has passed; "Open the app" when unknown. */
    internal fun ghatiText(s: JSONObject?, now: Long): String {
        val since = sinceSunrise(s, now) ?: return "Open the app"
        return "Ghaṭī ${(since / GHATI_MS) % 60} · Pala ${(since % GHATI_MS) * 60 / GHATI_MS}"
    }

    // ---- drawing -------------------------------------------------------------------------

    private val GOLD = Color.rgb(0xE8, 0xC8, 0x78)
    private val DIM = Color.rgb(0x7A, 0x6C, 0x4C)
    private val INK = Color.rgb(0xF2, 0xE8, 0xD0)
    private val HAND = Color.rgb(0xFF, 0x5A, 0x47)
    private val DISC = Color.rgb(0x15, 0x12, 0x0D)
    private val EDGE = Color.rgb(0x4A, 0x3C, 0x22)

    /**
     * The ghati scale (60 ticks, 0 at the top, clockwise), the ghati hand, and in the middle the ghati
     * number with "Pala" and the IST time under it. [since] is null when unknown: no hand, "Open the app".
     */
    internal fun drawFace(size: Int, since: Long?, time: String): Bitmap {
        val bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)
        val s = size.toFloat()
        val cx = s / 2
        val cy = s / 2
        val r = s / 2 - 1f
        val p = Paint(Paint.ANTI_ALIAS_FLAG)

        p.style = Paint.Style.FILL; p.color = DISC
        c.drawCircle(cx, cy, r, p)
        p.style = Paint.Style.STROKE; p.color = EDGE; p.strokeWidth = max(1.5f, s * 0.012f)
        c.drawCircle(cx, cy, r - p.strokeWidth / 2, p)

        // Ticks: every ghati, longer and brighter every fifth.
        p.strokeCap = Paint.Cap.ROUND
        val outer = r * 0.94f
        for (i in 0 until 60) {
            val major = i % 5 == 0
            val inner = outer - r * (if (major) 0.11f else 0.055f)
            p.color = if (major) GOLD else DIM
            p.strokeWidth = s * (if (major) 0.016f else 0.008f)
            val a = i * 6.0 * PI / 180
            c.drawLine(cx + (outer * sin(a)).toFloat(), cy - (outer * cos(a)).toFloat(), cx + (inner * sin(a)).toFloat(), cy - (inner * cos(a)).toFloat(), p)
        }

        // Numerals 0, 5, ... 55 when there is room for them.
        val t = Paint(Paint.ANTI_ALIAS_FLAG)
        t.textAlign = Paint.Align.CENTER
        if (size >= 150) {
            t.color = DIM; t.typeface = Typeface.DEFAULT; t.textSize = s * 0.065f
            val rn = outer - r * 0.19f
            for (n in 0 until 60 step 5) {
                val a = n * 6.0 * PI / 180
                c.drawText(n.toString(), cx + (rn * sin(a)).toFloat(), cy - (rn * cos(a)).toFloat() + t.textSize * 0.35f, t)
            }
        }

        // The ghati hand, under the writing so the numbers stay readable.
        if (since != null) {
            val a = (since.toDouble() / GHATI_MS) * 6.0 * PI / 180
            p.color = HAND; p.strokeWidth = s * 0.026f
            c.drawLine(cx, cy, cx + (outer * 0.9f * sin(a)).toFloat(), cy - (outer * 0.9f * cos(a)).toFloat(), p)
            p.style = Paint.Style.FILL
            c.drawCircle(cx, cy, s * 0.03f, p)
        }

        // The middle: GHAṬĪ, the number, Pala, and the time.
        fun text(str: String, y: Float, sz: Float, color: Int, bold: Boolean) {
            t.textSize = sz; t.typeface = if (bold) Typeface.DEFAULT_BOLD else Typeface.DEFAULT
            t.style = Paint.Style.STROKE; t.strokeWidth = sz * 0.22f; t.color = DISC; t.strokeJoin = Paint.Join.ROUND
            c.drawText(str, cx, y, t) // dark halo
            t.style = Paint.Style.FILL; t.color = color
            c.drawText(str, cx, y, t)
        }
        if (since == null) {
            text("Open", cy - s * 0.02f, s * 0.085f, GOLD, true)
            text("the app", cy + s * 0.08f, s * 0.085f, GOLD, true)
        } else {
            val ghati = (since / GHATI_MS) % 60
            val pala = (since % GHATI_MS) * 60 / GHATI_MS
            text("GHAṬĪ", cy - s * 0.15f, s * 0.06f, DIM, false)
            text(ghati.toString(), cy + s * 0.04f, s * 0.2f, GOLD, true)
            text("Pala $pala", cy + s * 0.14f, s * 0.07f, INK, false)
            text(time, cy + s * 0.235f, s * 0.07f, DIM, false)
        }
        return bmp
    }
}

class ClockFaceWidget : AppWidgetProvider() {
    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) = ClockWidgets.updateAll(context)
    override fun onAppWidgetOptionsChanged(context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int, newOptions: Bundle) = ClockWidgets.updateAll(context)
    override fun onEnabled(context: Context) = ClockWidgets.updateAll(context)
    override fun onDisabled(context: Context) = ClockWidgets.updateAll(context)
}
