// The Android app's side of the alarms. Does nothing in a normal browser.
//
// Inside the app (a WebView) the wrapper exposes `window.AndroidAlarms`, and
// the app rings alarms itself - with the phone locked and this page closed. It
// can only ring at concrete times, but alarms here recur on the Moon's
// schedule, so this file works the times out with the ordinary engine and
// hands them over:
//
//   - whenever alarms or settings change, and when the app opens, the next
//     rings of every enabled alarm (up to RINGS_PER_ALARM each, within the
//     engine's 75-day search limit) are pushed with AndroidAlarms.sync(json);
//   - alarms the app rang while this page was closed are read back with
//     AndroidAlarms.getRang() and recorded in the engine (Alarms.markRang), so
//     "just once" alarms switch off and nothing is rung twice.
//
// The page itself never rings while the bridge is present (see AlarmUI.init).
(function (global) {
  "use strict";

  const VedicEngine = global.VedicEngine = global.VedicEngine || {};
  const Native = global.AndroidAlarms;
  if (!Native) return;

  const Alarms = VedicEngine.Alarms;
  const DAY_MS = 24 * 3600 * 1000;
  const RINGS_PER_ALARM = 40;
  const MAX_RINGS = 600;
  const HORIZON_MS = 75 * DAY_MS;      // = MAX_SCAN_MS in alarms.js
  const REFRESH_MS = 3 * 3600 * 1000;  // re-sync at least this often while the app is open
  const TRACK_CHUNK = 3 * 174762;      // bytes per chunk handed to native: a multiple of 3, so base64 pieces join

  function safe(fn, fallback) {
    try { return fn(); } catch (e) { console.warn("AndroidBridge:", e); return fallback; }
  }

  // ---- alarms the app rang while we were away ---------------------------------

  function applyRang() {
    const rang = safe(function () { return JSON.parse(Native.getRang() || "[]"); }, []);
    if (!rang.length) return;
    let newest = 0;
    rang.forEach(function (r) {
      Alarms.markRang(r.alarmId, r.fireAtMs, r.rangAtMs);
      newest = Math.max(newest, r.rangAtMs || 0);
    });
    safe(function () { Native.ackRang(newest); });
  }

  // ---- the schedule -----------------------------------------------------------

  function ringOf(a, group) {
    const n = group.items.length;
    return {
      key: a.id + ":" + group.fireAt,
      alarmId: a.id,
      fireAtMs: group.fireAt,
      title: group.items[0].label + (n > 1 ? " +" + (n - 1) : ""),
      label: a.label || "",
      soundKind: a.soundKind,
      sound: a.sound !== false,
      notify: !!a.notify,
      repeat: a.repeat,
      items: group.items.map(function (it) {
        return { label: it.label, group: it.group, tone: it.tone || "", line: VedicEngine.AlarmUI.itemLine(it, a, group.fireAt) };
      }),
    };
  }

  // The payload for AndroidAlarms.sync: every enabled alarm's upcoming rings,
  // and how far ahead they are known (coveredUntil) so the app can warn when
  // that runs out. Async - the engine yields to the page while it searches.
  async function buildPayload() {
    const now = Date.now();
    const alarms = Alarms.list().filter(function (a) { return a.enabled; });
    let rings = [];
    let covered = now + HORIZON_MS;
    for (const a of alarms) {
      const groups = (await Alarms.upcoming(a.id, RINGS_PER_ALARM)).slice(0, RINGS_PER_ALARM);
      // A full list ends at its last ring; a short one means the whole 75-day search came up that empty.
      if (groups.length >= RINGS_PER_ALARM) covered = Math.min(covered, groups[groups.length - 1].fireAt);
      groups.forEach(function (g) { rings.push(ringOf(a, g)); });
    }
    rings.sort(function (x, y) { return x.fireAtMs - y.fireAtMs; });
    if (rings.length > MAX_RINGS) {
      rings = rings.slice(0, MAX_RINGS);
      covered = Math.min(covered, rings[rings.length - 1].fireAtMs);
    }
    return { v: 1, syncedAt: now, coveredUntil: covered, alarmCount: alarms.length, rings: rings };
  }

  // What the schedule depends on; unchanged => no need to recompute and push.
  function signature() {
    return JSON.stringify([
      Alarms.settingsKey(),
      Alarms.list().map(function (a) { const c = Object.assign({}, a); delete c.next; delete c.title; return c; }),
      Math.floor(Date.now() / REFRESH_MS),
    ]);
  }

  let busy = false, again = false, lastSig = null, timer = null;

  async function sync(force) {
    if (busy) { again = true; return; }
    busy = true;
    try {
      applyRang();
      const sig = signature();
      if (force || sig !== lastSig) {
        const payload = await buildPayload();
        // Edited while we were searching: what we computed may be stale; go round again.
        if (sig === signature()) {
          Native.sync(JSON.stringify(payload));
          lastSig = sig;
        } else again = true;
      }
    } catch (e) {
      console.error("AndroidBridge: sync failed", e);
    } finally {
      busy = false;
      if (again) { again = false; schedule(500); }
    }
  }

  function schedule(delay) {
    clearTimeout(timer);
    timer = setTimeout(function () { sync(false); }, delay == null ? 1200 : delay);
  }

  // ---- the person's own track: a copy for the native alarm -----------------------

  function readBase64(blob) {
    return new Promise(function (resolve, reject) {
      const r = new FileReader();
      r.onload = function () { resolve(String(r.result).split(",")[1] || ""); };
      r.onerror = function () { reject(r.error); };
      r.readAsDataURL(blob);
    });
  }

  async function sendTrack(name, data) {
    try {
      const blob = new Blob([data]);
      Native.trackBegin(name);
      for (let off = 0; off < blob.size; off += TRACK_CHUNK) {
        Native.trackChunk(await readBase64(blob.slice(off, off + TRACK_CHUNK)));
      }
      Native.trackEnd();
    } catch (e) {
      console.warn("AndroidBridge: could not copy the track to the app", e);
      safe(function () { Native.clearTrack(); });
    }
  }

  // ---- Settings wording ---------------------------------------------------------

  function wireSettings() {
    const section = document.getElementById("alarm-section");
    if (!section) return;
    // The web page has no alarm note; the app adds its own (phone-locked behaviour).
    let note = section.querySelector(".settings-note");
    if (!note) {
      note = document.createElement("p");
      note.className = "settings-note";
      section.appendChild(note);
    }
    note.textContent = "Alarms are saved as soon as you set them (no need to press Save) and follow real time, even while the dial shows another day. They ring even when your phone is locked or this app is closed. Open the app now and then so the schedule stays topped up.";
    const button = document.createElement("button");
    button.type = "button";
    button.id = "alarm-reliable";
    button.textContent = "Make alarms reliable…";
    button.addEventListener("click", function () { safe(function () { Native.openSetup(); }); });
    note.parentNode.insertBefore(button, note);
  }

  // ---- the lock-screen notification -----------------------------------------------

  // Today's tithi and nakshatra (always for the real time, not the day shown on the dial) for the
  // app's lock-screen notification. The app counts the ghati itself from sunrise.
  let lockSnap = null, lockSettings = null, lastLock = "";
  function pushLockClock(ctx) {
    if (typeof Native.setLockClock !== "function" || !ctx) return;
    const E = VedicEngine, now = new Date();
    const settings = ctx.getSettings(), data = ctx.getData();
    if (!data) return;
    if (settings !== lockSettings) { lockSettings = settings; lockSnap = null; } // Settings were saved
    if (!lockSnap || now < lockSnap.anchors.governingSunrise || now >= lockSnap.anchors.nextSunrise ||
        now >= lockSnap.tithi.endTime || now >= lockSnap.nakshatra.endTime) {
      lockSnap = E.Panchanga.compute(now, settings);
    }
    const snap = lockSnap;
    const vara = (data.vara.names && data.vara.names[snap.varaIndex]) || "";
    const json = JSON.stringify({
      sunriseMs: snap.anchors.governingSunrise.getTime(),
      nextSunriseMs: snap.anchors.nextSunrise.getTime(),
      vara: vara,
      tithi: E.RingAdapter.tithiNameAt(snap, data, now),
      tithiEndMs: snap.tithi.endTime.getTime(),
      nakshatra: data.nakshatra.names[snap.nakshatra.index],
      nakshatraEndMs: snap.nakshatra.endTime.getTime(),
    });
    if (json !== lastLock) { lastLock = json; safe(function () { Native.setLockClock(json); }); }
  }

  // Called once by the page: recomputes at start, every minute, and when the settings may have changed.
  function startLockClock(ctx) {
    function go() { safe(function () { pushLockClock(ctx); }); }
    go();
    setInterval(go, 60 * 1000);
    document.addEventListener("visibilitychange", function () { if (!document.hidden) go(); });
  }

  Alarms.onChange(function () { schedule(); });
  wireSettings();
  // With no alarms the engine never reports a change; still tell the app once.
  setTimeout(function () { sync(false); }, 2500);
  // The app may have rung while this page sat in the background.
  document.addEventListener("visibilitychange", function () { if (!document.hidden) schedule(300); });
  setInterval(function () { schedule(0); }, 15 * 60 * 1000);

  VedicEngine.AndroidBridge = { sync: sync, buildPayload: buildPayload, applyRang: applyRang, sendTrack: sendTrack, startLockClock: startLockClock, clearTrack: function () { safe(function () { Native.clearTrack(); }); } };
})(typeof window !== "undefined" ? window : globalThis);
