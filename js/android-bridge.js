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

  // A settings section in the page's own style: a dropdown (<details>) with a heading.
  function makeSection(id, title) {
    const section = document.createElement("section");
    section.id = id;
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    const h3 = document.createElement("h3");
    h3.textContent = title;
    summary.appendChild(h3);
    details.appendChild(summary);
    section.appendChild(details);
    return { section: section, body: details };
  }

  function wireSettings() {
    const alarms = document.getElementById("alarm-section");
    const actions = document.querySelector("#settings-panel .settings-actions");
    if (!alarms || !actions) return;
    const panel = actions.parentNode;
    const alarmBody = alarms.querySelector("details") || alarms;
    const button = document.createElement("button");
    button.type = "button";
    button.id = "alarm-reliable";
    button.textContent = "Make alarms reliable…";
    button.addEventListener("click", function () { safe(function () { Native.openSetup(); }); });
    const setBtn = alarmBody.querySelector("#alarm-set");
    if (setBtn) alarmBody.insertBefore(button, setBtn); else alarmBody.appendChild(button);

    // Display: phone-only options (they used to sit inside "Make alarms reliable"). They apply at once.
    if (typeof Native.getDisplayPrefs === "function") {
      const prefs = safe(function () { return JSON.parse(Native.getDisplayPrefs() || "{}"); }, {});
      const d = makeSection("display-section", "Display");
      [["keepOn", "Keep the screen on while the clock is open"],
       ["webUpdates", "Update the clock from the web when online (restart the app to apply)"]].forEach(function (o) {
        const label = document.createElement("label");
        const box = document.createElement("input");
        box.type = "checkbox";
        box.checked = !!prefs[o[0]];
        box.addEventListener("change", function () { safe(function () { Native.setDisplayPref(o[0], box.checked); }); });
        label.appendChild(box);
        label.appendChild(document.createTextNode(" " + o[1]));
        d.body.appendChild(label);
      });
      panel.insertBefore(d.section, actions);
    }

    // Check for updates: a plain button at the very end, just above Save and Cancel (no section of its own).
    // Older installs have no updater.
    if (typeof Native.openUpdate === "function") {
      const upd = document.createElement("button");
      upd.type = "button";
      upd.id = "app-update";
      upd.textContent = "Check for updates…";
      upd.addEventListener("click", function () { safe(function () { Native.openUpdate(); }); });
      panel.insertBefore(upd, actions);
    }
  }

  // ---- widgets: the next few days of tithi, nakshatra and sunrises --------------------

  // Each name holds until its end time; the app picks what holds at the moment, so the widgets stay
  // right with the app closed. Worked out from the real time (not the day shown on the dial).
  let widgetKey = "", widgetAt = 0, widgetFirstEnd = 0, widgetSettings = null, lastWidget = "";
  // The same tithi shows up once per day it spans, with end times that differ by a few ms: merge.
  function add(list, name, end) {
    const last = list[list.length - 1];
    if (last && last.n === name) last.e = Math.max(last.e, end); else list.push({ n: name, e: end });
  }
  function pushWidgets(ctx) {
    if (typeof Native.setWidgetData !== "function" || !ctx) return;
    const E = VedicEngine, now = new Date(), settings = ctx.getSettings(), data = ctx.getData();
    if (!data) return;
    const stale = settings !== widgetSettings || now.getTime() - widgetAt > 6 * 3600 * 1000 || now.getTime() >= widgetFirstEnd;
    if (stale) {
      widgetSettings = settings;
      const sunrises = [], tithis = [], naks = [];
      let t = now;
      for (let d = 0; d < 4; d++) {
        const snap = E.Panchanga.compute(t, settings);
        sunrises.push(snap.anchors.governingSunrise.getTime());
        snap.tithiSequence.forEach(function (e) {
          add(tithis, E.RingAdapter.tithiNameAt(snap, data, e.segStart), e.endTime.getTime());
        });
        snap.nakshatraSequence.forEach(function (e) {
          add(naks, data.nakshatra.names[e.index], e.endTime.getTime());
        });
        t = new Date(snap.anchors.nextSunrise.getTime() + 1000);
      }
      // Today's sequences start at sunrise: drop what has already ended.
      [tithis, naks].forEach(function (l) { while (l.length > 1 && l[0].e <= now.getTime()) l.shift(); });
      widgetAt = now.getTime();
      widgetFirstEnd = Math.min(tithis[0].e, naks[0].e);
      widgetKey = JSON.stringify({ sunrises: sunrises, tithis: tithis, nakshatras: naks });
    }
    if (widgetKey !== lastWidget) { lastWidget = widgetKey; safe(function () { Native.setWidgetData(widgetKey); }); }
  }

  // Called once by the page: at start, every minute (cheap unless something expired) and on return.
  function startWidgets(ctx) {
    function go() { safe(function () { pushWidgets(ctx); }); }
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

  VedicEngine.AndroidBridge = { startWidgets: startWidgets, sync: sync, buildPayload: buildPayload, applyRang: applyRang, sendTrack: sendTrack, clearTrack: function () { safe(function () { Native.clearTrack(); }); } };
})(typeof window !== "undefined" ? window : globalThis);
