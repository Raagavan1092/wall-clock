package com.raagavan.vedicclock

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * One receiver for everything that should (re)start the alarms: the alarm itself, a reboot (also
 * before first unlock), an app update, a clock or time-zone change - plus the daily horizon check.
 */
class AlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action
        Log.i("VedicAlarms", "AlarmReceiver: $action")
        if (action == LockClock.ACTION_REFRESH) {
            LockClock.refresh(context)
            return
        }
        if (action == AlarmScheduler.ACTION_HORIZON) {
            Notifier.checkHorizon(context)
            AlarmScheduler.reschedule(context)
            return
        }
        // Every other action: ring what is due (a ring missed by under 5 minutes still rings), then chain to the next.
        LockClock.refresh(context)
        val ring = AlarmScheduler.processAndReschedule(context)
        if (ring != null) RingService.start(context, ring)
    }
}
