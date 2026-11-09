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
        // The face is a picture sized to the widget (in px, kept modest: the launcher caps what a widget may carry).
        // A wide widget (the lock screen only offers 1x1 / 1x2 cells) gets the small clock plus the ghati, pala and time beside it.
        val density = ctx.resources.displayMetrics.density
        val wDp = options?.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0) ?: 0
        val hDp = options?.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0) ?: 0
        val dw = if (wDp > 0) wDp else 110
        val dh = if (hDp > 0) hDp else 110
        val k = min(1f, 560f / max(dw * density, dh * density)) // longest side at most ~560 px
        val wPx = (dw * density * k).toInt().coerceAtLeast(96)
        val hPx = (dh * density * k).toInt().coerceAtLeast(48)
        val v = RemoteViews(ctx.packageName, R.layout.widget_clock)
        v.setImageViewBitmap(R.id.w_face, drawFace(wPx, hPx, sinceSunrise(status, now), hhmm(now)))
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
     * The widget picture. Wide (at least 1.4x as wide as tall): the dial at the left, and at the right
     * the ghati, the pala and the IST time. Otherwise the dial fills the picture with the writing in its middle.
     * [since] is null when unknown: no hands, "Open the app".
     */
    internal fun drawFace(w: Int, h: Int, since: Long?, time: String): Bitmap {
        val wide = w >= h * 1.4f
        val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)
        val t = Paint(Paint.ANTI_ALIAS_FLAG).apply { textAlign = Paint.Align.CENTER }
        if (!wide) {
            val size = min(w, h)
            c.translate((w - size) / 2f, (h - size) / 2f)
            drawDial(c, size, since, true)
            val s = size.toFloat(); val cx = s / 2; val cy = s / 2
            if (since == null) {
                text(c, t, "Open", cx, cy - s * 0.02f, s * 0.085f, GOLD, true)
                text(c, t, "the app", cx, cy + s * 0.08f, s * 0.085f, GOLD, true)
            } else {
                text(c, t, "GHAṬĪ", cx, cy - s * 0.15f, s * 0.06f, DIM, false)
                text(c, t, ghatiOf(since).toString(), cx, cy + s * 0.04f, s * 0.2f, GOLD, true)
                text(c, t, "Pala ${palaOf(since)}", cx, cy + s * 0.14f, s * 0.07f, INK, false)
                text(c, t, time, cx, cy + s * 0.235f, s * 0.07f, DIM, false)
            }
            return bmp
        }
        // Wide: dial (no numerals; too small to read) then the three lines, left-aligned in the rest.
        drawDial(c, h, since, false)
        val x = h + h * 0.14f
        val room = w - x - h * 0.04f
        t.textAlign = Paint.Align.LEFT
        fun fit(str: String, bold: Boolean, want: Float): Float {
            t.typeface = if (bold) Typeface.DEFAULT_BOLD else Typeface.DEFAULT
            t.textSize = want
            val wd = t.measureText(str)
            return if (wd > room) want * room / wd else want
        }
        fun line(str: String, y: Float, want: Float, color: Int, bold: Boolean) {
            val sz = fit(str, bold, want)
            t.textSize = sz; t.typeface = if (bold) Typeface.DEFAULT_BOLD else Typeface.DEFAULT
            t.color = color
            c.drawText(str, x, y, t)
        }
        val hh = h.toFloat()
        if (since == null) {
            line("Open the app", hh * 0.58f, hh * 0.2f, GOLD, true)
        } else {
            line("Ghaṭī ${ghatiOf(since)} · Pala ${palaOf(since)}", hh * 0.40f, hh * 0.2f, GOLD, true)
            line(time, hh * 0.74f, hh * 0.3f, INK, true)
        }
        return bmp
    }

    private fun ghatiOf(since: Long) = (since / GHATI_MS) % 60
    private fun palaOf(since: Long) = (since % GHATI_MS) * 60 / GHATI_MS

    private fun text(c: Canvas, t: Paint, str: String, x: Float, y: Float, sz: Float, color: Int, bold: Boolean) {
        t.textSize = sz; t.typeface = if (bold) Typeface.DEFAULT_BOLD else Typeface.DEFAULT
        t.style = Paint.Style.STROKE; t.strokeWidth = sz * 0.22f; t.color = DISC; t.strokeJoin = Paint.Join.ROUND
        c.drawText(str, x, y, t) // dark halo
        t.style = Paint.Style.FILL; t.color = color
        c.drawText(str, x, y, t)
    }

    /**
     * The dial in a [size] x [size] square at the canvas origin: the ghati scale (60 ticks, 0 at the top,
     * clockwise) and both hands, as in the app: the red day hand (one turn per sunrise-to-sunrise day) and
     * the thin pala hand (one turn per ghati, 24 minutes).
     */
    private fun drawDial(c: Canvas, size: Int, since: Long?, numerals: Boolean) {
        val s = size.toFloat()
        val cx = s / 2
        val cy = s / 2
        val r = s / 2 - 1f
        val p = Paint(Paint.ANTI_ALIAS_FLAG)

        p.style = Paint.Style.FILL; p.color = DISC
        c.drawCircle(cx, cy, r, p)
        p.style = Paint.Style.STROKE; p.color = EDGE; p.strokeWidth = max(1.5f, s * 0.012f)
        c.drawCircle(cx, cy, r - p.strokeWidth / 2, p)

        // Ticks: every ghati, longer and brighter every fifth (the small ones are left out when tiny).
        p.strokeCap = Paint.Cap.ROUND
        val outer = r * 0.94f
        for (i in 0 until 60) {
            val major = i % 5 == 0
            if (!major && size < 90) continue
            val inner = outer - r * (if (major) 0.13f else 0.055f)
            p.color = if (major) GOLD else DIM
            p.strokeWidth = s * (if (major) 0.022f else 0.008f)
            val a = i * 6.0 * PI / 180
            c.drawLine(cx + (outer * sin(a)).toFloat(), cy - (outer * cos(a)).toFloat(), cx + (inner * sin(a)).toFloat(), cy - (inner * cos(a)).toFloat(), p)
        }

        if (numerals && size >= 150) {
            val t = Paint(Paint.ANTI_ALIAS_FLAG)
            t.textAlign = Paint.Align.CENTER
            t.color = DIM; t.typeface = Typeface.DEFAULT; t.textSize = s * 0.065f
            val rn = outer - r * 0.19f
            for (n in 0 until 60 step 5) {
                val a = n * 6.0 * PI / 180
                c.drawText(n.toString(), cx + (rn * sin(a)).toFloat(), cy - (rn * cos(a)).toFloat() + t.textSize * 0.35f, t)
            }
        }

        if (since != null) {
            // Pala hand: thin and long, once round per ghati.
            val pa = ((since % GHATI_MS).toDouble() / GHATI_MS) * 2 * PI
            p.color = INK; p.strokeWidth = max(1f, s * 0.012f)
            c.drawLine(cx, cy, cx + (outer * 0.92f * sin(pa)).toFloat(), cy - (outer * 0.92f * cos(pa)).toFloat(), p)
            // Day (ghati) hand: red and a little shorter.
            val a = (since.toDouble() / GHATI_MS) * 6.0 * PI / 180
            p.color = HAND; p.strokeWidth = s * 0.03f
            c.drawLine(cx, cy, cx + (outer * 0.72f * sin(a)).toFloat(), cy - (outer * 0.72f * cos(a)).toFloat(), p)
            p.style = Paint.Style.FILL
            c.drawCircle(cx, cy, s * 0.04f, p)
        }
    }
}

class ClockFaceWidget : AppWidgetProvider() {
    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) = ClockWidgets.updateAll(context)
    override fun onAppWidgetOptionsChanged(context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int, newOptions: Bundle) = ClockWidgets.updateAll(context)
    override fun onEnabled(context: Context) = ClockWidgets.updateAll(context)
    override fun onDisabled(context: Context) = ClockWidgets.updateAll(context)
}
