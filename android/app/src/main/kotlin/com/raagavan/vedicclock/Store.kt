package com.raagavan.vedicclock

import android.content.Context
import android.content.SharedPreferences
import android.util.Base64
import java.io.File

/**
 * Everything lives in device-protected storage, so alarms still ring after a reboot while the
 * phone is waiting for its PIN (before first unlock); the receivers and the ring screen are
 * direct-boot aware for the same reason. All access goes through one lock.
 */
object Store {
    private val lock = Any()

    private fun dir(ctx: Context): File = ctx.createDeviceProtectedStorageContext().filesDir

    fun prefs(ctx: Context): SharedPreferences =
        ctx.createDeviceProtectedStorageContext().getSharedPreferences("vedic", Context.MODE_PRIVATE)

    private fun write(file: File, text: String) {
        val tmp = File(file.parentFile, file.name + ".tmp")
        tmp.writeText(text)
        if (!tmp.renameTo(file)) { file.delete(); tmp.renameTo(file) }
    }

    // ---- the schedule ----------------------------------------------------------------

    /** Reads, changes and saves the schedule as one step; returns the new schedule. */
    fun updateSchedule(ctx: Context, change: (Schedule) -> Schedule): Schedule = synchronized(lock) {
        val file = File(dir(ctx), "schedule.json")
        val old = Schedule.parse(file.takeIf { it.exists() }?.readText())
        val new = change(old)
        if (new != old) write(file, new.toJson().toString())
        new
    }

    fun schedule(ctx: Context): Schedule = synchronized(lock) {
        Schedule.parse(File(dir(ctx), "schedule.json").takeIf { it.exists() }?.readText())
    }

    // ---- alarms rung natively, for the page to record -----------------------------------

    fun addRang(ctx: Context, add: List<Rang>) = synchronized(lock) {
        if (add.isEmpty()) return@synchronized
        val file = File(dir(ctx), "rang.json")
        write(file, Rang.toJson(Rang.append(Rang.parseList(file.takeIf { it.exists() }?.readText()), add)))
    }

    fun rangJson(ctx: Context): String = synchronized(lock) {
        val file = File(dir(ctx), "rang.json")
        Rang.toJson(Rang.parseList(file.takeIf { it.exists() }?.readText()))
    }

    fun ackRang(ctx: Context, upTo: Long) = synchronized(lock) {
        val file = File(dir(ctx), "rang.json")
        if (!file.exists()) return@synchronized
        write(file, Rang.toJson(Rang.ack(Rang.parseList(file.readText()), upTo)))
    }

    // ---- the person's own alarm track -------------------------------------------------

    fun trackFile(ctx: Context): File = File(dir(ctx), "track.bin")

    fun trackBegin(ctx: Context, name: String) = synchronized(lock) {
        File(dir(ctx), "track.tmp").delete()
        prefs(ctx).edit().putString("track_pending_name", name).apply()
    }

    fun trackChunk(ctx: Context, base64: String) = synchronized(lock) {
        File(dir(ctx), "track.tmp").appendBytes(Base64.decode(base64, Base64.DEFAULT))
    }

    fun trackEnd(ctx: Context) = synchronized(lock) {
        val tmp = File(dir(ctx), "track.tmp")
        if (!tmp.exists()) return@synchronized
        val final = trackFile(ctx)
        final.delete()
        if (tmp.renameTo(final)) {
            prefs(ctx).edit().putString("track_name", prefs(ctx).getString("track_pending_name", "track")).apply()
        }
    }

    fun trackClear(ctx: Context) = synchronized(lock) {
        trackFile(ctx).delete()
        File(dir(ctx), "track.tmp").delete()
        prefs(ctx).edit().remove("track_name").apply()
    }
}
