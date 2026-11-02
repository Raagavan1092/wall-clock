package com.raagavan.vedicclock

import android.app.Activity
import android.app.KeyguardManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextClock
import android.widget.TextView

/**
 * The full-screen alarm: shown over the lock screen and turns the screen on. Dark and gold like the
 * web app (css/style.css tokens). Dismiss stops the sound; the next alarm was already registered when this one fired.
 */
class RingActivity : Activity() {
    private lateinit var content: LinearLayout
    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            if (intent.action == RingService.ACTION_CLOSE) finishAndRemoveTask() else render()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD,
            )
        }
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        (getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager).requestDismissKeyguard(this, null)

        val scroll = ScrollView(this).apply { setBackgroundColor(BG); isFillViewport = true }
        content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            val pad = dp(24)
            setPadding(pad, dp(48), pad, dp(32))
        }
        scroll.addView(content, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        setContentView(scroll)
        // Draw under the bars and keep clear of them.
        scroll.setOnApplyWindowInsetsListener { v, insets ->
            v.setPadding(insets.systemWindowInsetLeft, insets.systemWindowInsetTop, insets.systemWindowInsetRight, insets.systemWindowInsetBottom)
            insets
        }

        val filter = IntentFilter().apply { addAction(RingService.ACTION_CLOSE); addAction(RingService.ACTION_UPDATE) }
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED) else registerReceiver(receiver, filter)
        render()
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        render()
    }

    override fun onDestroy() {
        runCatching { unregisterReceiver(receiver) }
        super.onDestroy()
    }

    // An alarm: the back button must not silence it by accident. Dismiss is the button.
    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {}

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

    private fun text(s: String, size: Float, color: Int, bold: Boolean = false, top: Int = 0) = TextView(this).apply {
        this.text = s
        textSize = size
        setTextColor(color)
        gravity = Gravity.CENTER
        if (bold) setTypeface(typeface, Typeface.BOLD)
        setPadding(0, dp(top), 0, 0)
    }

    private fun render() {
        val ring = RingService.current
        if (ring == null) { finishAndRemoveTask(); return }
        content.removeAllViews()
        content.addView(text("🔔", 56f, GOLD))
        content.addView(text("ALARM", 13f, MUTED, bold = true, top = 4).apply { letterSpacing = 0.3f })
        content.addView(TextClock(this).apply {
            format12Hour = "HH:mm"; format24Hour = "HH:mm"
            timeZone = "Asia/Kolkata"
            textSize = 54f; setTextColor(CENTRE); gravity = Gravity.CENTER
            setTypeface(Typeface.create("sans-serif-light", Typeface.NORMAL))
        })
        if (ring.label.isNotEmpty()) content.addView(text(ring.label, 22f, GHATI, bold = true, top = 8))

        ring.items.forEach { item ->
            val tone = when (item.tone) { "bad" -> BAD; "good" -> GOOD; else -> GOLD }
            val card = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(dp(16), dp(12), dp(16), dp(12))
                background = GradientDrawable().apply { setColor(CARD); cornerRadius = dp(14).toFloat(); setStroke(dp(1), STROKE) }
            }
            card.addView(text(item.label, 20f, tone, bold = true).apply { gravity = Gravity.START })
            if (item.group.isNotEmpty()) card.addView(text(item.group.uppercase(), 11f, MUTED, top = 2).apply { gravity = Gravity.START; letterSpacing = 0.15f })
            card.addView(text(item.line, 15f, CENTRE, top = 6).apply { gravity = Gravity.START })
            content.addView(card, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(12) })
        }

        val spacer = View(this)
        content.addView(spacer, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
        val dismiss = TextView(this).apply {
            text = "Dismiss"
            textSize = 24f
            setTextColor(BG)
            setTypeface(typeface, Typeface.BOLD)
            gravity = Gravity.CENTER
            background = GradientDrawable().apply { setColor(GOLD); cornerRadius = dp(36).toFloat() }
            isClickable = true
            setOnClickListener { RingService.dismiss(this@RingActivity) }
        }
        content.addView(dismiss, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(76)).apply { topMargin = dp(28) })
    }

    companion object {
        // Tokens from css/style.css.
        private val BG = Color.parseColor("#0b0a08")
        private val CARD = Color.parseColor("#1c180f")
        private val STROKE = Color.parseColor("#5a4a2a")
        private val GOLD = Color.parseColor("#c9a85c")
        private val GHATI = Color.parseColor("#ffd77a")
        private val CENTRE = Color.parseColor("#f0e6c8")
        private val MUTED = Color.parseColor("#a89a78")
        private val BAD = Color.parseColor("#ff8d6e")
        private val GOOD = Color.parseColor("#82c4ff")
    }
}
