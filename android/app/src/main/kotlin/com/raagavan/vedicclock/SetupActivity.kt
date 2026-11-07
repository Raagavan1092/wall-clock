package com.raagavan.vedicclock

import android.Manifest
import android.app.Activity
import android.app.AlarmManager
import android.app.NotificationManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.CheckBox
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * "Make alarms reliable": every permission and phone setting that decides whether an alarm rings
 * with the screen locked, each with its state and a button to the right system page, and the
 * "Test alarm in 1 minute" button. Shown on first run and from Settings > Alarms in the page.
 */
class SetupActivity : Activity() {
    private lateinit var list: LinearLayout
    private lateinit var testStatus: TextView

    private enum class State { OK, TODO, MANUAL }

    private class Row(val title: String, val help: String, val state: State, val action: String, val run: () -> Unit)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val root = ScrollView(this).apply { setBackgroundColor(BG) }
        val col = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(20), dp(28), dp(20), dp(40)) }
        root.addView(col, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        root.setOnApplyWindowInsetsListener { v, insets ->
            v.setPadding(insets.systemWindowInsetLeft, insets.systemWindowInsetTop, insets.systemWindowInsetRight, insets.systemWindowInsetBottom)
            insets
        }
        setContentView(root)

        col.addView(label("Make alarms reliable", 24f, GHATI, bold = true))
        col.addView(label("For an alarm to ring when the phone is locked, switched off by the screen, or the app is closed, Android needs these. Tap each red one.", 14f, MUTED, top = 6))
        list = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        col.addView(list)

        col.addView(label("Test it", 18f, GOLD, bold = true, top = 24))
        col.addView(label("Press the button, then lock your phone and put it down. It should ring loudly in about a minute, over the lock screen. Then restart the phone and try once more, and once with Do Not Disturb on.", 14f, CENTRE, top = 4))
        col.addView(button("Test alarm in 1 minute") {
            val at = AlarmScheduler.scheduleTest(this)
            val text = "Test alarm set for " + SimpleDateFormat("HH:mm:ss", Locale.US).apply { timeZone = TimeZone.getTimeZone("Asia/Kolkata") }.format(Date(at)) + " - lock the phone now."
            testStatus.text = text
            Toast.makeText(this, text, Toast.LENGTH_LONG).show()
        }, matchWidth().apply { topMargin = dp(10) })
        testStatus = label("", 14f, GHATI, top = 8)
        col.addView(testStatus)

        col.addView(label("Display", 18f, GOLD, bold = true, top = 24))
        col.addView(CheckBox(this).apply {
            text = "Keep the screen on while the clock is open"
            setTextColor(CENTRE)
            isChecked = Store.prefs(this@SetupActivity).getBoolean(MainActivity.PREF_KEEP_ON, false)
            setOnCheckedChangeListener { _, on -> Store.prefs(this@SetupActivity).edit().putBoolean(MainActivity.PREF_KEEP_ON, on).apply() }
        })

        col.addView(CheckBox(this).apply {
            text = "Show the clock over the lock screen when it is open (pair with keep screen on)"
            setTextColor(CENTRE)
            isChecked = Store.prefs(this@SetupActivity).getBoolean(LockClock.PREF_SHOW_LOCKED, false)
            setOnCheckedChangeListener { _, on -> Store.prefs(this@SetupActivity).edit().putBoolean(LockClock.PREF_SHOW_LOCKED, on).apply() }
        })

        col.addView(CheckBox(this).apply {
            text = "Show ghati, tithi and nakshatra in a lock-screen notification (open the app once after turning on)"
            setTextColor(CENTRE)
            isChecked = LockClock.enabled(this@SetupActivity)
            setOnCheckedChangeListener { _, on -> LockClock.setEnabled(this@SetupActivity, on) }
        })

        col.addView(CheckBox(this).apply {
            text = "Update the clock from the web when online (restart the app to apply)"
            setTextColor(CENTRE)
            isChecked = Store.prefs(this@SetupActivity).getBoolean(WebSource.PREF_WEB_UPDATES, true)
            setOnCheckedChangeListener { _, on -> Store.prefs(this@SetupActivity).edit().putBoolean(WebSource.PREF_WEB_UPDATES, on).apply() }
        })

        col.addView(label("Also check", 18f, GOLD, bold = true, top = 24))
        col.addView(label("• Turn the alarm volume up (Settings > Sound & vibration > Alarm). Alarms use the alarm volume, not the ringer or media volume.\n• Do Not Disturb: alarms still ring unless you switched alarms off in its exceptions.\n• Alarms ring from the moment the phone starts, even before you unlock it after a restart (your own audio file needs one unlock first; the bell plays instead).", 13f, MUTED, top = 4))

        col.addView(button("Done") { finish() }, matchWidth().apply { topMargin = dp(28) })
    }

    override fun onResume() {
        super.onResume()
        refresh()
    }

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()
    private fun matchWidth() = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)

    private fun label(s: String, size: Float, color: Int, bold: Boolean = false, top: Int = 0) = TextView(this).apply {
        text = s; textSize = size; setTextColor(color)
        if (bold) setTypeface(typeface, Typeface.BOLD)
        setPadding(0, dp(top), 0, 0)
    }

    private fun button(s: String, onClick: () -> Unit) = Button(this).apply {
        text = s; isAllCaps = false; textSize = 16f; setTextColor(BG)
        background = GradientDrawable().apply { setColor(GOLD); cornerRadius = dp(24).toFloat() }
        setOnClickListener { onClick() }
    }

    // ---- checks -------------------------------------------------------------------------

    private fun notificationsGranted() =
        Build.VERSION.SDK_INT < 33 || checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    private fun exactAlarmsAllowed(): Boolean {
        if (Build.VERSION.SDK_INT < 31) return true
        return (getSystemService(Context.ALARM_SERVICE) as AlarmManager).canScheduleExactAlarms()
    }

    private fun fullScreenAllowed(): Boolean {
        if (Build.VERSION.SDK_INT < 34) return true
        return (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).canUseFullScreenIntent()
    }

    private fun batteryUnrestricted() =
        (getSystemService(Context.POWER_SERVICE) as PowerManager).isIgnoringBatteryOptimizations(packageName)

    private fun rows(): List<Row> = listOf(
        Row("Notifications", "Needed to show the alarm on the lock screen.",
            if (notificationsGranted()) State.OK else State.TODO, if (notificationsGranted()) "Settings" else "Allow") {
            if (!notificationsGranted() && Build.VERSION.SDK_INT >= 33 && shouldShowRequestPermissionRationale(Manifest.permission.POST_NOTIFICATIONS).not() && askedBefore()) {
                open(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, packageName))
            } else if (!notificationsGranted() && Build.VERSION.SDK_INT >= 33) {
                Store.prefs(this).edit().putBoolean("asked_notifications", true).apply()
                requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
            } else {
                open(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, packageName))
            }
        },
        Row("Exact alarms", "Lets alarms ring at the exact second.",
            if (exactAlarmsAllowed()) State.OK else State.TODO, if (exactAlarmsAllowed()) "Settings" else "Allow") {
            if (Build.VERSION.SDK_INT >= 31) open(Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:$packageName"))) else appDetails()
        },
        Row("Full-screen alarm", "Lets the alarm open over the lock screen and turn the screen on.",
            if (fullScreenAllowed()) State.OK else State.TODO, if (fullScreenAllowed()) "Settings" else "Allow") {
            if (Build.VERSION.SDK_INT >= 34) open(Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:$packageName"))) else appDetails()
        },
        Row("Battery: unrestricted", "Stops the phone from pausing the app in the background. Choose \"Allow\" / \"Unrestricted\".",
            if (batteryUnrestricted()) State.OK else State.TODO, if (batteryUnrestricted()) "Settings" else "Allow") {
            open(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName")),
                fallback = { open(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)) })
        },
        Row("OnePlus: allow auto-launch", "OxygenOS can only be checked by you: open it and switch Vedic Wall Clock on. Cannot be detected by the app.",
            State.MANUAL, "Open") { openOemAutoLaunch() },
        Row("OnePlus: allow background activity", "App info > Battery usage > \"Allow background activity\". Cannot be detected by the app.",
            State.MANUAL, "Open") { openOemBattery() },
    )

    private fun askedBefore() = Store.prefs(this).getBoolean("asked_notifications", false)

    private fun refresh() {
        list.removeAllViews()
        rows().forEach { row ->
            val card = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(dp(14), dp(12), dp(14), dp(12))
                background = GradientDrawable().apply { setColor(CARD); cornerRadius = dp(14).toFloat(); setStroke(dp(1), STROKE) }
            }
            val (mark, color) = when (row.state) {
                State.OK -> "✓" to OK
                State.TODO -> "✗" to BAD
                State.MANUAL -> "?" to GHATI
            }
            val head = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
            head.addView(label(mark, 22f, color, bold = true).apply { minWidth = dp(30) })
            head.addView(label(row.title, 17f, CENTRE, bold = true), LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
            head.addView(Button(this).apply {
                text = row.action; isAllCaps = false; textSize = 14f
                setTextColor(if (row.state == State.OK) CENTRE else BG)
                background = GradientDrawable().apply {
                    setColor(if (row.state == State.OK) Color.TRANSPARENT else GOLD)
                    cornerRadius = dp(20).toFloat(); setStroke(dp(1), if (row.state == State.OK) STROKE else GOLD)
                }
                setOnClickListener { row.run() }
            })
            card.addView(head)
            card.addView(label(row.help, 13f, MUTED, top = 4))
            list.addView(card, matchWidth().apply { topMargin = dp(10) })
        }
    }

    // ---- going to system pages ---------------------------------------------------------------

    /** Starts [intent]; if the phone has no such page (OEM screens vary), runs [fallback] or opens this app's details. */
    private fun open(intent: Intent, fallback: (() -> Unit)? = null) {
        try {
            startActivity(intent)
        } catch (e: Exception) {
            if (fallback != null) fallback() else appDetails()
        }
    }

    private fun appDetails() {
        try {
            startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName")))
        } catch (e: Exception) {
            Toast.makeText(this, "Open Settings > Apps > Vedic Wall Clock", Toast.LENGTH_LONG).show()
        }
    }

    private fun tryComponents(vararg parts: Pair<String, String>): Boolean {
        for ((pkg, cls) in parts) {
            try {
                startActivity(Intent().setComponent(ComponentName(pkg, cls)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                return true
            } catch (e: Exception) { /* not on this phone / version: try the next */ }
        }
        return false
    }

    // OnePlus / OPPO (ColorOS-based OxygenOS) screens, newest names first. None is guaranteed on OxygenOS 16, so each is tried in turn.
    private fun openOemAutoLaunch() {
        val ok = tryComponents(
            "com.oplus.battery" to "com.oplus.startupapp.StartupAppListActivity",
            "com.coloros.safecenter" to "com.coloros.safecenter.startupapp.StartupAppListActivity",
            "com.coloros.safecenter" to "com.coloros.safecenter.permission.startup.StartupAppListActivity",
            "com.oneplus.security" to "com.oneplus.security.chainlaunch.view.ChainLaunchAppListActivity",
            "com.oplus.safecenter" to "com.oplus.safecenter.startupapp.StartupAppListActivity",
        )
        if (!ok) {
            Toast.makeText(this, "Open Battery > Allow auto-launch / background activity for Vedic Wall Clock", Toast.LENGTH_LONG).show()
            appDetails()
        }
    }

    private fun openOemBattery() {
        val ok = tryComponents(
            "com.oplus.battery" to "com.oplus.powermanager.fuelgauge.PowerUsageModelActivity",
            "com.coloros.oppoguardelf" to "com.coloros.powermanager.fuelgauge.PowerUsageModelActivity",
            "com.coloros.oppoguardelf" to "com.coloros.powermanager.fuelgauge.PowerConsumptionActivity",
        )
        if (!ok) {
            Toast.makeText(this, "App info > Battery usage > Allow background activity", Toast.LENGTH_LONG).show()
            appDetails()
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        refresh()
    }

    companion object {
        private val BG = Color.parseColor("#0b0a08")
        private val CARD = Color.parseColor("#1c180f")
        private val STROKE = Color.parseColor("#5a4a2a")
        private val GOLD = Color.parseColor("#c9a85c")
        private val GHATI = Color.parseColor("#ffd77a")
        private val CENTRE = Color.parseColor("#f0e6c8")
        private val MUTED = Color.parseColor("#a89a78")
        private val BAD = Color.parseColor("#ff8d6e")
        private val OK = Color.parseColor("#7fd17f")
    }
}
