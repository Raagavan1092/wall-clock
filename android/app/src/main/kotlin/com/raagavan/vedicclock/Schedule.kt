package com.raagavan.vedicclock

import org.json.JSONArray
import org.json.JSONObject

// The scheduling logic, with no Android classes in it so it runs in plain JVM unit tests.
//
// The web page works out the concrete ring times (they follow the Moon, so only the
// JS engine can) and hands them over as a list of Rings. Native code keeps that list,
// asks AlarmManager for the next one only, and chains to the following one when it rings.

const val MINUTE_MS = 60_000L
const val DAY_MS = 24 * 60 * MINUTE_MS

/** A ring missed by up to this long (phone was off / rebooting) still rings; older ones are skipped. Mirrors GRACE_MS in js/alarms.js. */
const val GRACE_MS = 5 * MINUTE_MS

/** Rings due within this of each other ring together, as one. Mirrors BATCH_MS in js/alarms.js. */
const val BATCH_MS = 60_000L

/** Warn when the pre-computed rings run out within this long. */
const val HORIZON_WARN_MS = 7 * DAY_MS

/** The "Test alarm in 1 minute" button's pseudo-alarm. */
const val TEST_ALARM_ID = "__test"

data class RingItem(val label: String, val group: String, val tone: String, val line: String) {
    fun toJson(): JSONObject = JSONObject().put("label", label).put("group", group).put("tone", tone).put("line", line)

    companion object {
        fun fromJson(o: JSONObject) = RingItem(o.optString("label"), o.optString("group"), o.optString("tone"), o.optString("line"))
    }
}

data class Ring(
    val key: String,
    val alarmId: String,
    val fireAtMs: Long,
    val title: String,
    val label: String,
    val soundKind: String,
    val sound: Boolean,
    val notify: Boolean,
    val repeat: String,
    val items: List<RingItem>,
) {
    val isTest: Boolean get() = alarmId == TEST_ALARM_ID
    val isOnce: Boolean get() = repeat == "once"

    fun toJson(): JSONObject = JSONObject()
        .put("key", key).put("alarmId", alarmId).put("fireAtMs", fireAtMs).put("title", title).put("label", label)
        .put("soundKind", soundKind).put("sound", sound).put("notify", notify).put("repeat", repeat)
        .put("items", JSONArray().also { a -> items.forEach { a.put(it.toJson()) } })

    companion object {
        fun fromJson(o: JSONObject): Ring {
            val items = o.optJSONArray("items") ?: JSONArray()
            return Ring(
                key = o.getString("key"),
                alarmId = o.getString("alarmId"),
                fireAtMs = o.getLong("fireAtMs"),
                title = o.optString("title"),
                label = o.optString("label"),
                soundKind = o.optString("soundKind", "bell").ifEmpty { "bell" },
                sound = o.optBoolean("sound", true),
                notify = o.optBoolean("notify", false),
                repeat = o.optString("repeat", "always"),
                items = (0 until items.length()).map { RingItem.fromJson(items.getJSONObject(it)) },
            )
        }
    }
}

/** What native knows: the pending rings, how far ahead they reach, and the last ring made per alarm. */
data class Schedule(
    val rings: List<Ring> = emptyList(),
    /** The rings are complete up to here (epoch ms); after it the app must be opened to recompute. 0 = unknown. */
    val coveredUntilMs: Long = 0,
    val syncedAtMs: Long = 0,
    /** Enabled alarms at the last sync (0 = nothing to warn about). */
    val alarmCount: Int = 0,
    /** alarmId -> fire time of the latest ring already made or skipped; a later sync must not resurrect it. */
    val lastFired: Map<String, Long> = emptyMap(),
) {
    fun toJson(): JSONObject = JSONObject()
        .put("coveredUntilMs", coveredUntilMs).put("syncedAtMs", syncedAtMs).put("alarmCount", alarmCount)
        .put("lastFired", JSONObject().also { o -> lastFired.forEach { (k, v) -> o.put(k, v) } })
        .put("rings", JSONArray().also { a -> rings.forEach { a.put(it.toJson()) } })

    companion object {
        fun fromJson(o: JSONObject): Schedule {
            val rings = o.optJSONArray("rings") ?: JSONArray()
            val fired = o.optJSONObject("lastFired") ?: JSONObject()
            return Schedule(
                rings = (0 until rings.length()).mapNotNull { runCatching { Ring.fromJson(rings.getJSONObject(it)) }.getOrNull() },
                coveredUntilMs = o.optLong("coveredUntilMs", 0),
                syncedAtMs = o.optLong("syncedAtMs", 0),
                alarmCount = o.optInt("alarmCount", 0),
                lastFired = fired.keys().asSequence().associateWith { fired.getLong(it) },
            )
        }

        fun parse(text: String?): Schedule =
            if (text.isNullOrBlank()) Schedule() else runCatching { fromJson(JSONObject(text)) }.getOrDefault(Schedule())
    }
}

data class Due(
    /** Rings that ring now (due, and no more than GRACE_MS late). */
    val ring: List<Ring>,
    /** Rings too late to ring (over GRACE_MS ago): dropped without ringing. */
    val skipped: List<Ring>,
    /** The earliest ring still to come (null if none). */
    val next: Ring?,
)

object ScheduleLogic {
    /** Allowed early arrival: the alarm manager never fires early, but clocks round. */
    private const val SLOP_MS = 1_000L

    /** Takes a sync from the page: replaces the schedule, minus rings already made, keeping a pending test alarm. */
    fun applySync(current: Schedule, payload: String, now: Long): Schedule {
        val o = JSONObject(payload)
        val rings = o.optJSONArray("rings") ?: JSONArray()
        val incoming = (0 until rings.length()).mapNotNull { runCatching { Ring.fromJson(rings.getJSONObject(it)) }.getOrNull() }
        val fresh = incoming.filter { it.fireAtMs > (current.lastFired[it.alarmId] ?: Long.MIN_VALUE) && it.alarmId != TEST_ALARM_ID }
        val tests = current.rings.filter { it.isTest && it.fireAtMs >= now - GRACE_MS }
        return current.copy(
            rings = (fresh + tests).sortedBy { it.fireAtMs },
            coveredUntilMs = o.optLong("coveredUntil", 0),
            syncedAtMs = o.optLong("syncedAt", now),
            alarmCount = o.optInt("alarmCount", 0),
            lastFired = current.lastFired.filterValues { it > now - 90 * DAY_MS },
        )
    }

    /** What is due at [now]: ring, skip, and what comes next. */
    fun plan(s: Schedule, now: Long): Due {
        val skipped = s.rings.filter { it.fireAtMs < now - GRACE_MS }
        val ring = s.rings.filter { it.fireAtMs >= now - GRACE_MS && it.fireAtMs <= now + SLOP_MS }
        val next = s.rings.filter { it.fireAtMs > now + SLOP_MS }.minByOrNull { it.fireAtMs }
        return Due(ring, skipped, next)
    }

    /** The ring to ask AlarmManager for: the earliest not already too late (a recent miss fires at once). */
    fun nextToSchedule(s: Schedule, now: Long): Ring? = s.rings.filter { it.fireAtMs >= now - GRACE_MS }.minByOrNull { it.fireAtMs }

    /**
     * After [plan]: removes the rings made and skipped, remembers them, and - as the page does when
     * it rings a "just once" alarm - drops that alarm's remaining rings.
     */
    fun consume(s: Schedule, due: Due): Schedule {
        if (due.ring.isEmpty() && due.skipped.isEmpty()) return s
        val gone = (due.ring + due.skipped).map { it.key }.toSet()
        val onceAlarms = due.ring.filter { it.isOnce }.map { it.alarmId }.toSet()
        val fired = s.lastFired.toMutableMap()
        (due.ring + due.skipped).filter { !it.isTest }.forEach { fired[it.alarmId] = maxOf(fired[it.alarmId] ?: 0L, it.fireAtMs) }
        return s.copy(rings = s.rings.filter { it.key !in gone && it.alarmId !in onceAlarms }, lastFired = fired)
    }

    /** Rings due together are one alarm to the person: the earliest one's sound and label, everything listed. */
    fun mergeDue(due: List<Ring>): Ring? {
        if (due.isEmpty()) return null
        val sorted = due.sortedBy { it.fireAtMs }
        val first = sorted.first()
        if (sorted.size == 1) return first
        val items = sorted.flatMap { it.items }
        val n = items.size
        return first.copy(
            key = sorted.joinToString("+") { it.key },
            title = (items.firstOrNull()?.label ?: first.title) + if (n > 1) " +" + (n - 1) else "",
            label = sorted.map { it.label }.filter { it.isNotEmpty() }.distinct().joinToString(" · "),
            sound = sorted.any { it.sound },
            notify = sorted.any { it.notify },
            items = items,
        )
    }

    /** Days left before the known rings run out, if that is under a week and there is something to warn about; else null. */
    fun horizonDaysLeft(s: Schedule, now: Long): Int? {
        if (s.alarmCount <= 0 || s.coveredUntilMs <= 0) return null
        val left = s.coveredUntilMs - now
        if (left >= HORIZON_WARN_MS) return null
        return maxOf(0L, left / DAY_MS).toInt()
    }

    /** A ring for the "Test alarm in 1 minute" button. */
    fun testRing(now: Long, delayMs: Long = 60_000L): Ring = Ring(
        key = "$TEST_ALARM_ID:${now + delayMs}", alarmId = TEST_ALARM_ID, fireAtMs = now + delayMs,
        title = "Test alarm", label = "", soundKind = "bell", sound = true, notify = false, repeat = "once",
        items = listOf(RingItem("Test alarm", "Vedic Wall Clock", "", "If you can hear this, your alarms will ring.")),
    )
}

/** An alarm the app rang, waiting for the page to record it in its own engine. */
data class Rang(val alarmId: String, val fireAtMs: Long, val rangAtMs: Long) {
    fun toJson(): JSONObject = JSONObject().put("alarmId", alarmId).put("fireAtMs", fireAtMs).put("rangAtMs", rangAtMs)

    companion object {
        const val MAX = 200

        fun parseList(text: String?): List<Rang> {
            if (text.isNullOrBlank()) return emptyList()
            return runCatching {
                val a = JSONArray(text)
                (0 until a.length()).map { val o = a.getJSONObject(it); Rang(o.getString("alarmId"), o.getLong("fireAtMs"), o.getLong("rangAtMs")) }
            }.getOrDefault(emptyList())
        }

        fun toJson(list: List<Rang>): String = JSONArray().also { a -> list.forEach { a.put(it.toJson()) } }.toString()

        fun append(list: List<Rang>, add: List<Rang>): List<Rang> = (list + add).takeLast(MAX)

        fun ack(list: List<Rang>, upToRangAtMs: Long): List<Rang> = list.filter { it.rangAtMs > upToRangAtMs }
    }
}
