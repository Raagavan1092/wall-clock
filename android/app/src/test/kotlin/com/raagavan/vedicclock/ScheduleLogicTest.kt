package com.raagavan.vedicclock

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ScheduleLogicTest {
    private val now = 1_800_000_000_000L

    private fun ring(alarm: String, at: Long, repeat: String = "always", sound: String = "bell", label: String = "", notify: Boolean = false) = Ring(
        key = "$alarm:$at", alarmId = alarm, fireAtMs = at, title = "Ev $at", label = label, soundKind = sound,
        sound = true, notify = notify, repeat = repeat, items = listOf(RingItem("Ev $at", "Moments", "", "Begins now · 05:00")),
    )

    private fun payload(rings: List<Ring>, covered: Long = now + 40 * DAY_MS, alarms: Int = 1) = JSONObject()
        .put("v", 1).put("syncedAt", now).put("coveredUntil", covered).put("alarmCount", alarms)
        .put("rings", JSONArray().also { a -> rings.forEach { a.put(it.toJson()) } }).toString()

    private fun sync(rings: List<Ring>, current: Schedule = Schedule(), covered: Long = now + 40 * DAY_MS, alarms: Int = 1) =
        ScheduleLogic.applySync(current, payload(rings, covered, alarms), now)

    @Test fun `ring json round trips`() {
        val r = ring("a", now + 1000, repeat = "once", sound = "tune:funk-alarm", label = "Wake", notify = true)
        assertEquals(r, Ring.fromJson(JSONObject(r.toJson().toString())))
    }

    @Test fun `sync sorts rings and keeps the horizon`() {
        val s = sync(listOf(ring("a", now + 3000), ring("b", now + 1000), ring("a", now + 2000)))
        assertEquals(listOf(1000L, 2000L, 3000L), s.rings.map { it.fireAtMs - now })
        assertEquals(now + 40 * DAY_MS, s.coveredUntilMs)
        assertEquals(1, s.alarmCount)
    }

    @Test fun `a ring that is not yet due is next, nothing rings`() {
        val s = sync(listOf(ring("a", now + 10 * MINUTE_MS), ring("a", now + 20 * MINUTE_MS)))
        val due = ScheduleLogic.plan(s, now)
        assertTrue(due.ring.isEmpty() && due.skipped.isEmpty())
        assertEquals(now + 10 * MINUTE_MS, due.next?.fireAtMs)
        assertEquals(now + 10 * MINUTE_MS, ScheduleLogic.nextToSchedule(s, now)?.fireAtMs)
    }

    @Test fun `a ring that fires on time rings and the next one is chained`() {
        val s = sync(listOf(ring("a", now), ring("a", now + 24 * 60 * MINUTE_MS)))
        val due = ScheduleLogic.plan(s, now + 300)
        assertEquals(1, due.ring.size)
        assertEquals(now + DAY_MS, due.next?.fireAtMs)
        val after = ScheduleLogic.consume(s, due)
        assertEquals(listOf(now + DAY_MS), after.rings.map { it.fireAtMs })
        assertEquals(now, after.lastFired["a"])
    }

    @Test fun `a ring missed by under 5 minutes still rings`() {
        val s = sync(listOf(ring("a", now - 4 * MINUTE_MS), ring("a", now + 1000 * MINUTE_MS)))
        val due = ScheduleLogic.plan(s, now)
        assertEquals(1, due.ring.size)
        assertTrue(due.skipped.isEmpty())
        assertEquals(now - 4 * MINUTE_MS, ScheduleLogic.nextToSchedule(s, now)?.fireAtMs) // asked for at once
    }

    @Test fun `a ring missed by over 5 minutes is skipped, not rung`() {
        val s = sync(listOf(ring("a", now - 6 * MINUTE_MS), ring("a", now + 1000 * MINUTE_MS)))
        val due = ScheduleLogic.plan(s, now)
        assertTrue(due.ring.isEmpty())
        assertEquals(1, due.skipped.size)
        val after = ScheduleLogic.consume(s, due)
        assertEquals(1, after.rings.size)
        assertEquals(now - 6 * MINUTE_MS, after.lastFired["a"])
        assertNull(ScheduleLogic.nextToSchedule(Schedule(), now))
    }

    @Test fun `exactly 5 minutes late still rings`() {
        val due = ScheduleLogic.plan(sync(listOf(ring("a", now - GRACE_MS))), now)
        assertEquals(1, due.ring.size)
    }

    @Test fun `ringing a just-once alarm drops its other rings but not other alarms`() {
        val s = sync(listOf(ring("once", now, repeat = "once"), ring("once", now + DAY_MS, repeat = "once"), ring("daily", now + 5000)))
        val after = ScheduleLogic.consume(s, ScheduleLogic.plan(s, now))
        assertEquals(listOf("daily"), after.rings.map { it.alarmId })
    }

    @Test fun `skipping a late once-alarm ring does not switch the alarm off`() {
        val s = sync(listOf(ring("once", now - 10 * MINUTE_MS, repeat = "once"), ring("once", now + DAY_MS, repeat = "once")))
        val after = ScheduleLogic.consume(s, ScheduleLogic.plan(s, now))
        assertEquals(listOf(now + DAY_MS), after.rings.map { it.fireAtMs })
    }

    @Test fun `a later sync cannot bring back a ring already made`() {
        val first = sync(listOf(ring("a", now), ring("a", now + DAY_MS)))
        val rung = ScheduleLogic.consume(first, ScheduleLogic.plan(first, now))
        // The page re-syncs before it has heard about the ring: the old ring is still in its list.
        val again = sync(listOf(ring("a", now), ring("a", now + DAY_MS)), rung)
        assertEquals(listOf(now + DAY_MS), again.rings.map { it.fireAtMs })
    }

    @Test fun `rings due together ring once, merged`() {
        val s = sync(listOf(ring("a", now, label = "One"), ring("b", now + 20_000, sound = "tune:x", label = "Two", notify = true)))
        val due = ScheduleLogic.plan(s, now + 30_000)
        assertEquals(2, due.ring.size)
        val merged = ScheduleLogic.mergeDue(due.ring)!!
        assertEquals(2, merged.items.size)
        assertEquals("bell", merged.soundKind) // the earliest one's
        assertTrue(merged.notify)
        assertEquals("One · Two", merged.label)
        assertTrue(merged.title.endsWith("+1"))
        assertNull(ScheduleLogic.mergeDue(emptyList()))
    }

    @Test fun `the test alarm survives a sync and rings once`() {
        val withTest = Schedule(rings = listOf(ScheduleLogic.testRing(now)))
        val s = sync(listOf(ring("a", now + DAY_MS)), withTest)
        assertEquals(2, s.rings.size)
        val due = ScheduleLogic.plan(s, now + 60_000)
        assertEquals(TEST_ALARM_ID, due.ring.single().alarmId)
        val after = ScheduleLogic.consume(s, due)
        assertEquals(listOf("a"), after.rings.map { it.alarmId })
        assertFalse(after.lastFired.containsKey(TEST_ALARM_ID))
    }

    @Test fun `an old test alarm does not hang around`() {
        val stale = Schedule(rings = listOf(ScheduleLogic.testRing(now - 3_600_000)))
        assertTrue(sync(emptyList(), stale).rings.isEmpty())
    }

    @Test fun `horizon warning only when under a week is left and alarms exist`() {
        assertNull(ScheduleLogic.horizonDaysLeft(sync(emptyList(), covered = now + 3 * DAY_MS, alarms = 0), now))
        assertNull(ScheduleLogic.horizonDaysLeft(sync(emptyList(), covered = now + 8 * DAY_MS), now))
        assertEquals(3, ScheduleLogic.horizonDaysLeft(sync(emptyList(), covered = now + 3 * DAY_MS + 5000), now))
        assertEquals(0, ScheduleLogic.horizonDaysLeft(sync(emptyList(), covered = now - DAY_MS), now))
    }

    @Test fun `schedule survives being saved and loaded`() {
        val s = sync(listOf(ring("a", now + 1000), ring("b", now + 2000)))
        val back = Schedule.parse(s.toJson().toString())
        assertEquals(s, back)
        assertEquals(Schedule(), Schedule.parse("not json"))
        assertEquals(Schedule(), Schedule.parse(null))
    }

    @Test fun `bad rings in a sync are ignored, good ones kept`() {
        val o = JSONObject(payload(listOf(ring("a", now + 1000))))
        o.getJSONArray("rings").put(JSONObject().put("oops", 1))
        val s = ScheduleLogic.applySync(Schedule(), o.toString(), now)
        assertEquals(1, s.rings.size)
    }

    @Test fun `rang log appends, caps and is acknowledged`() {
        var log = Rang.parseList(null)
        log = Rang.append(log, listOf(Rang("a", 1, 10), Rang("b", 2, 20)))
        log = Rang.parseList(Rang.toJson(log))
        assertEquals(2, log.size)
        assertEquals(listOf(Rang("b", 2, 20)), Rang.ack(log, 10))
        assertTrue(Rang.ack(log, 20).isEmpty())
        val many = Rang.append(emptyList(), (1..300).map { Rang("a", it.toLong(), it.toLong()) })
        assertEquals(Rang.MAX, many.size)
        assertNotNull(many.last())
    }
}
