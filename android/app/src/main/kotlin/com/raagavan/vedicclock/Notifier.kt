package com.raagavan.vedicclock

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

object Notifier {
    const val CHANNEL_RING = "ring"
    const val CHANNEL_RING_FALLBACK = "ring_fallback"
    const val CHANNEL_INFO = "info"
    const val ID_RING = 1001
    const val ID_NOTICE = 1002
    const val ID_HORIZON = 1003

    private val IST: TimeZone = TimeZone.getTimeZone("Asia/Kolkata")

    fun manager(ctx: Context) = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

    fun ensureChannels(ctx: Context) {
        val nm = manager(ctx)
        // The service plays the sound itself (alarm volume, looping), so this channel is silent.
        nm.createNotificationChannel(NotificationChannel(CHANNEL_RING, "Ringing alarms", NotificationManager.IMPORTANCE_HIGH).apply {
            description = "Shown while an alarm is ringing, with the full-screen alarm over the lock screen."
            setSound(null, null)
            enableVibration(false)
            lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        })
        // Last resort if the ringing service cannot start: let the system play the alarm tone.
        nm.createNotificationChannel(NotificationChannel(CHANNEL_RING_FALLBACK, "Alarms (backup)", NotificationManager.IMPORTANCE_HIGH).apply {
            description = "Used only if the alarm could not start normally."
            setSound(
                RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM),
                AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build(),
            )
            enableVibration(true)
            lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        })
        nm.createNotificationChannel(NotificationChannel(CHANNEL_INFO, "Alarm notes", NotificationManager.IMPORTANCE_DEFAULT).apply {
            description = "Alarms that rang, and a reminder when the schedule is about to run out."
        })
    }

    private fun flags() = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE

    fun ringActivityIntent(ctx: Context): PendingIntent = PendingIntent.getActivity(
        ctx, 10,
        Intent(ctx, RingActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
        flags(),
    )

    fun dismissIntent(ctx: Context): PendingIntent = PendingIntent.getService(
        ctx, 11, Intent(ctx, RingService::class.java).setAction(RingService.ACTION_DISMISS), flags(),
    )

    fun timeText(ms: Long): String = SimpleDateFormat("HH:mm", Locale.US).apply { timeZone = IST }.format(Date(ms))

    private fun body(ring: Ring): String =
        ring.items.joinToString("\n") { it.label + " - " + it.line }.ifEmpty { ring.title }

    /** The notification that goes with the ringing foreground service (and carries the full-screen intent). */
    fun ringNotification(ctx: Context, ring: Ring, channel: String = CHANNEL_RING): Notification {
        val first = ring.items.firstOrNull()
        return Notification.Builder(ctx, channel)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(if (ring.label.isNotEmpty()) ring.label + " · " + ring.title else ring.title)
            .setContentText(first?.line ?: "Alarm")
            .setStyle(Notification.BigTextStyle().bigText(body(ring)))
            .setCategory(Notification.CATEGORY_ALARM)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setPriority(Notification.PRIORITY_MAX)
            .setOngoing(true)
            .setAutoCancel(false)
            .setWhen(ring.fireAtMs)
            .setShowWhen(true)
            .setContentIntent(ringActivityIntent(ctx))
            .setFullScreenIntent(ringActivityIntent(ctx), true)
            .addAction(Notification.Action.Builder(null, "Dismiss", dismissIntent(ctx)).build())
            .setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE)
            .build()
    }

    /** After an alarm rang with "Notification" on (or was never dismissed): a plain note of it. */
    fun postRangNotice(ctx: Context, ring: Ring, missed: Boolean) {
        val title = (if (missed) "Missed alarm: " else "Alarm: ") + ring.title
        val n = Notification.Builder(ctx, CHANNEL_INFO)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText("Rang at " + timeText(System.currentTimeMillis()))
            .setStyle(Notification.BigTextStyle().bigText(body(ring)))
            .setCategory(Notification.CATEGORY_STATUS)
            .setAutoCancel(true)
            .setContentIntent(PendingIntent.getActivity(ctx, 12, Intent(ctx, MainActivity::class.java), flags()))
            .build()
        manager(ctx).notify(ID_NOTICE, n)
    }

    /** "Alarms are scheduled until <date> - open the app to extend", when under a week remains. */
    fun checkHorizon(ctx: Context, now: Long = System.currentTimeMillis()) {
        val s = Store.schedule(ctx)
        val left = ScheduleLogic.horizonDaysLeft(s, now)
        val nm = manager(ctx)
        if (left == null) { nm.cancel(ID_HORIZON); return }
        ensureChannels(ctx)
        val until = SimpleDateFormat("MMM d", Locale.US).apply { timeZone = IST }.format(Date(s.coveredUntilMs))
        val n = Notification.Builder(ctx, CHANNEL_INFO)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle("Alarms are scheduled until $until")
            .setContentText("Open the app to extend them.")
            .setAutoCancel(true)
            .setContentIntent(PendingIntent.getActivity(ctx, 13, Intent(ctx, MainActivity::class.java), flags()))
            .build()
        nm.notify(ID_HORIZON, n)
    }
}
