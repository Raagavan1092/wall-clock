package com.raagavan.vedicclock

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * Keeps exactly one AlarmManager alarm registered: the next ring. setAlarmClock() is the right
 * call for an alarm clock - it is exempt from Doze and battery restrictions and from the
 * exact-alarm permission, and the system shows its alarm icon. When it fires,
 * [processAndReschedule] rings what is due and registers the one after.
 */
object AlarmScheduler {
    private const val TAG = "VedicAlarms"
    const val ACTION_RING = "com.raagavan.vedicclock.RING"
    const val ACTION_HORIZON = "com.raagavan.vedicclock.HORIZON"

    private fun flags() = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE

    private fun ringIntent(ctx: Context): PendingIntent =
        PendingIntent.getBroadcast(ctx, 0, Intent(ctx, AlarmReceiver::class.java).setAction(ACTION_RING), flags())

    private fun horizonIntent(ctx: Context): PendingIntent =
        PendingIntent.getBroadcast(ctx, 1, Intent(ctx, AlarmReceiver::class.java).setAction(ACTION_HORIZON), flags())

    private fun openAppIntent(ctx: Context): PendingIntent =
        PendingIntent.getActivity(ctx, 2, Intent(ctx, MainActivity::class.java), flags())

    /** Registers the next ring (or cancels, if none) and the once-a-day check that the rings have not run out. */
    fun reschedule(ctx: Context, now: Long = System.currentTimeMillis()) {
        val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val next = ScheduleLogic.nextToSchedule(Store.schedule(ctx), now)
        try {
            if (next == null) {
                am.cancel(ringIntent(ctx))
            } else {
                // A ring only just missed (still within the grace period) is asked for at once.
                am.setAlarmClock(AlarmManager.AlarmClockInfo(maxOf(next.fireAtMs, now + 500), openAppIntent(ctx)), ringIntent(ctx))
            }
        } catch (e: SecurityException) {
            Log.e(TAG, "Could not set the alarm", e)
        }
        // Daily, not exact: it only checks whether the schedule is about to run out.
        am.setInexactRepeating(AlarmManager.RTC, now + DAY_MS / 2, AlarmManager.INTERVAL_DAY, horizonIntent(ctx))
    }

    /**
     * Rings whatever is due now (merged into one ring), drops what is too late, and registers
     * the next ring. Called when the alarm fires and after a reboot / time change / app update.
     * Returns the ring to show, or null.
     */
    fun processAndReschedule(ctx: Context, now: Long = System.currentTimeMillis()): Ring? {
        var plan: Due? = null
        Store.updateSchedule(ctx) { s ->
            val due = ScheduleLogic.plan(s, now)
            plan = due
            ScheduleLogic.consume(s, due)
        }
        val due = plan
        val ring = due?.let { ScheduleLogic.mergeDue(it.ring) }
        if (due != null && due.ring.isNotEmpty()) {
            Store.addRang(ctx, due.ring.filter { !it.isTest }.map { Rang(it.alarmId, it.fireAtMs, now) })
        }
        if (due != null && due.skipped.isNotEmpty()) Log.i(TAG, "Skipped ${due.skipped.size} ring(s) that were over 5 minutes late")
        reschedule(ctx, now)
        return ring
    }

    /** A new schedule from the page. */
    fun onSync(ctx: Context, payload: String) {
        val now = System.currentTimeMillis()
        Store.updateSchedule(ctx) { ScheduleLogic.applySync(it, payload, now) }
        reschedule(ctx, now)
    }

    /** The "Test alarm in 1 minute" button. Returns the time it will ring. */
    fun scheduleTest(ctx: Context): Long {
        val now = System.currentTimeMillis()
        val test = ScheduleLogic.testRing(now)
        Store.updateSchedule(ctx) { s -> s.copy(rings = (s.rings.filter { !it.isTest } + test).sortedBy { it.fireAtMs }) }
        reschedule(ctx, now)
        return test.fireAtMs
    }
}
