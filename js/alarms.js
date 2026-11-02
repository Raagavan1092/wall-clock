// Alarms: a saved list of "ring me for <these events>, at the start / at the
// end / some time before the start", checked against the REAL clock (never
// the dial's time-travel override - scrubbing to tomorrow must not ring
// anything).
//
// An alarm names one or more events from RingAdapter.buildAlarmCatalog (a
// tithi, a nakṣatra, Rāhu Kālam, a muhūrta, sunrise ...). Events recur, so
// "next time it rings" means searching forward through Vedic days: the
// occurrence index below computes each day's events with the ordinary
// Panchanga engine, glues together the pieces of an event that straddle
// sunrise, and caches the days so every alarm (and the dialog's live
// preview) shares the work. Alarms ring while the clock is open - there is
// no server to wake a closed page.
//
// All times in here are epoch milliseconds.
(function (global) {
  "use strict";

  const VedicEngine = global.VedicEngine = global.VedicEngine || {};

  const STORAGE_KEY = "vedicWallClock.alarms.v1";
  const MIN_MS = 60 * 1000;
  const DAY_MS = 24 * 60 * MIN_MS;
  const UNIT_MS = { min: MIN_MS, hr: 60 * MIN_MS, ghati: 24 * MIN_MS }; // a ghaṭī is 24 minutes
  const UNIT_LABEL = { min: "min", hr: "hr", ghati: "ghaṭī" };
  const MAX_OFFSET_MS = 7 * DAY_MS;
  // An alarm that comes due while the page was asleep still rings if it is
  // no more than this late; anything older is skipped rather than shouted.
  const GRACE_MS = 5 * MIN_MS;
  // Alarms due within this of each other ring together as one.
  const BATCH_MS = 60 * 1000;
  // Pieces of one event from neighbouring days (each found by its own root
  // search) can disagree by seconds at the join.
  const MERGE_SLACK_MS = 90 * 1000;
  // Rarest events (a given nakṣatra, a Saṅkrānti) recur within ~30 days.
  const MAX_SCAN_MS = 75 * DAY_MS;

  let ctx = null; // { getSettings(), getData() }
  let storageKey = STORAGE_KEY;
  let ringHandler = null;
  let alarms = [];
  const changeListeners = [];
  let catalogCache = null;

  function getCatalog() {
    if (!catalogCache) {
      const groups = VedicEngine.RingAdapter.buildAlarmCatalog(ctx.getData());
      const byId = new Map();
      groups.forEach(function (g) {
        g.items.forEach(function (it) { it.group = g.id; it.groupTitle = g.title; it.tone = g.tone; byId.set(it.id, it); });
      });
      catalogCache = { groups: groups, byId: byId };
    }
    return catalogCache;
  }

  // ---- occurrence index ---------------------------------------------------

  const index = { sig: null, gen: 0, days: [], merged: null, extending: null };

  function settingsSignature() {
    return JSON.stringify(VedicEngine.Panchanga.mergeSettings(ctx.getSettings()));
  }

  // Drops every cached day when location/ayanāṃśa/sunrise changed. True if it did.
  function syncSettings() {
    const sig = settingsSignature();
    if (sig === index.sig) return false;
    index.sig = sig;
    index.days = [];
    index.merged = null;
    index.gen++;
    return true;
  }

  function computeDay(atMs) {
    const snapshot = VedicEngine.Panchanga.compute(new Date(atMs), ctx.getSettings());
    const events = VedicEngine.RingAdapter.buildAlarmEvents(snapshot, ctx.getData()).map(function (ev) {
      return { id: ev.id, start: ev.start.getTime(), end: ev.end.getTime(), detail: ev.detail };
    });
    return { sunrise: snapshot.anchors.governingSunrise.getTime(), next: snapshot.anchors.nextSunrise.getTime(), events: events };
  }

  // Starts the index at the Vedic day containing (fromMs - 24h): one day
  // back, so an event that began before `fromMs` is seen with its true start
  // and is not mistaken for one starting now.
  function ensureStart(fromMs) {
    const want = fromMs - DAY_MS;
    if (!index.days.length || want < index.days[0].sunrise) {
      index.days = [computeDay(want)];
      index.merged = null;
    }
  }

  function addDay() {
    const last = index.days[index.days.length - 1];
    const day = computeDay(last.next + MIN_MS);
    if (day.sunrise <= last.sunrise) throw new Error("Alarms: the day search did not advance.");
    index.days.push(day);
    index.merged = null;
    const cutoff = Date.now() - 3 * DAY_MS;
    while (index.days.length > 2 && index.days[0].next < cutoff) index.days.shift();
  }

  // One day at a time, yielding to the page in between so a long search for
  // a rare event never freezes the dial. Callers that overlap share the step.
  function extend() {
    if (!index.extending) {
      index.extending = new Promise(function (resolve) { setTimeout(resolve, 0); }).then(function () {
        if (index.days.length) addDay();
      }).finally(function () { index.extending = null; });
    }
    return index.extending;
  }

  // Every event's occurrences, with the pieces from neighbouring days joined.
  // `finalBefore`: an occurrence ending before it can no longer grow;
  // `processedUntil`: nothing not yet computed starts before it.
  function merged() {
    if (index.merged) return index.merged;
    const byId = new Map();
    index.days.forEach(function (day) {
      day.events.forEach(function (ev) {
        if (!byId.has(ev.id)) byId.set(ev.id, []);
        byId.get(ev.id).push(ev);
      });
    });
    const list = [];
    byId.forEach(function (pieces, id) {
      pieces.sort(function (a, b) { return a.start - b.start || b.end - a.end; });
      let cur = null;
      pieces.forEach(function (p) {
        if (cur && p.start <= cur.end + MERGE_SLACK_MS) {
          if (p.end > cur.end) cur.end = p.end;
          if (!cur.detail && p.detail) cur.detail = p.detail;
        } else {
          cur = { id: id, start: p.start, end: p.end, detail: p.detail };
          list.push(cur);
        }
      });
    });
    const last = index.days[index.days.length - 1];
    index.merged = { list: list, finalBefore: last.sunrise, processedUntil: last.next };
    return index.merged;
  }

  function fireTime(occ, spec) {
    if (spec.mode === "end") return occ.end;
    return spec.mode === "before" ? occ.start - spec.offsetMs : occ.start;
  }

  // Occurrences of `spec.events` whose alarm time falls after `afterMs`,
  // earliest first. Resolves once at least `count` are certain (every
  // earlier-ringing occurrence is known and final), or the search limit is
  // hit. Resolves with every certain one, not just `count`.
  async function findFires(spec, afterMs, count) {
    const wanted = new Set(spec.events);
    for (;;) {
      const gen = index.gen;
      ensureStart(afterMs);
      const m = merged();
      // Whatever has not been computed yet starts no earlier than this, so
      // rings before it are final.
      const horizon = spec.mode === "end" ? m.processedUntil : m.processedUntil - spec.offsetMs;
      const certain = [];
      let earliestUnsettled = Infinity;
      m.list.forEach(function (occ) {
        if (!wanted.has(occ.id)) return;
        const fire = fireTime(occ, spec);
        if (fire <= afterMs) return;
        // An occurrence still touching the last computed day might yet be
        // extended by the next one, so its end is not settled.
        if (occ.end < m.finalBefore - MERGE_SLACK_MS) certain.push({ fire: fire, occ: occ });
        else earliestUnsettled = Math.min(earliestUnsettled, fire);
      });
      certain.sort(function (a, b) { return a.fire - b.fire; });
      const bound = Math.min(horizon, earliestUnsettled);
      const exhausted = m.processedUntil - afterMs > MAX_SCAN_MS;
      // The margin keeps alarms due within BATCH_MS of each other together.
      const settled = certain.filter(function (c) { return c.fire < bound - BATCH_MS; });
      if (settled.length >= count || exhausted) {
        return (exhausted ? certain.filter(function (c) { return c.fire < bound; }) : settled).map(function (c) {
          return { fire: c.fire, id: c.occ.id, start: c.occ.start, end: c.occ.end, detail: c.occ.detail };
        });
      }
      await extend();
      if (gen !== index.gen) syncSettings(); // settings changed mid-search: start over on the new ones
    }
  }

  // ---- alarm records ------------------------------------------------------

  function newId() {
    return "al" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  // A clean alarm from a draft or from storage; null if it names no event.
  function normalize(d) {
    const known = getCatalog().byId;
    const events = (Array.isArray(d.events) ? d.events : []).filter(function (id, i, arr) {
      return typeof id === "string" && known.has(id) && arr.indexOf(id) === i;
    });
    if (!events.length) return null;
    let mode = d.mode === "end" || d.mode === "before" ? d.mode : "start";
    const unit = UNIT_MS[d.offsetUnit] ? d.offsetUnit : "min";
    let value = Number(d.offsetValue);
    if (!isFinite(value) || value <= 0) value = 0;
    let offsetMs = Math.min(MAX_OFFSET_MS, Math.round(value * UNIT_MS[unit] / 1000) * 1000);
    if (mode === "before" && offsetMs === 0) mode = "start";
    if (mode !== "before") { offsetMs = 0; value = 0; }
    return {
      id: typeof d.id === "string" ? d.id : newId(),
      events: events,
      mode: mode,
      offsetValue: value,
      offsetUnit: unit,
      offsetMs: offsetMs,
      repeat: d.repeat === "once" ? "once" : "always",
      label: typeof d.label === "string" ? d.label.trim().slice(0, 60) : "",
      sound: d.sound !== false,
      soundKind: d.soundKind === "track" ? "track" : "bell", // the built-in bell, or the person's own track
      notify: !!d.notify,
      enabled: d.enabled !== false,
      armedAfter: isFinite(d.armedAfter) ? d.armedAfter : Date.now(),
      lastRang: isFinite(d.lastRang) ? d.lastRang : null,
      createdAt: isFinite(d.createdAt) ? d.createdAt : Date.now(),
    };
  }

  function serialize(a) {
    const out = {};
    Object.keys(a).forEach(function (k) { if (k.charAt(0) !== "_") out[k] = a[k]; });
    return out;
  }

  function persist() {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ v: 1, alarms: alarms.map(serialize) }));
    } catch (e) {
      console.warn("Alarms: failed to write localStorage.", e);
    }
  }

  function load() {
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem(storageKey) || "null"); } catch (e) { console.warn("Alarms: failed to read localStorage.", e); }
    alarms = ((raw && Array.isArray(raw.alarms)) ? raw.alarms : []).map(normalize).filter(Boolean);
  }

  function emitChange() {
    changeListeners.forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } });
  }

  function specOf(a) {
    return { events: a.events, mode: a.mode, offsetMs: a.offsetMs };
  }

  // Finds when `a` rings next (async) and stores it as a._next:
  // { fireAt, items: [{ id, start, end, detail }] } or null when nothing
  // is coming within the search limit. a._next stays undefined while searching.
  function schedule(a) {
    a._token = (a._token || 0) + 1;
    const token = a._token;
    a._next = undefined;
    if (!a.enabled) return;
    const after = Math.max(a.armedAfter, Date.now() - GRACE_MS);
    findFires(specOf(a), after, 1).then(function (found) {
      if (token !== a._token) return;
      if (!found.length) { a._next = null; } else {
        a._next = {
          fireAt: found[0].fire,
          items: found.filter(function (f) { return f.fire <= found[0].fire + BATCH_MS; }),
        };
      }
      emitChange();
    }).catch(function (err) {
      console.error("Alarms: scheduling failed", err);
      if (token === a._token) { a._next = null; emitChange(); }
    });
  }

  function ring(a, next, now) {
    if (!ringHandler) return;
    const known = getCatalog().byId;
    ringHandler({
      alarm: a,
      at: now,
      fireAt: next.fireAt,
      items: next.items.map(function (f) {
        const item = known.get(f.id);
        return { id: f.id, label: f.detail || item.label, group: item.groupTitle, instant: !!item.instant, start: f.start, end: f.end };
      }),
    });
  }

  // Called about once a second (and by tests with a chosen time).
  function tick(now) {
    if (!ctx) return;
    if (now == null) now = Date.now();
    if (syncSettings()) {
      alarms.forEach(schedule);
      emitChange();
      return;
    }
    let changed = false;
    alarms.forEach(function (a) {
      if (!a.enabled || !a._next || now < a._next.fireAt) return;
      const next = a._next;
      a._next = undefined;
      a.armedAfter = next.fireAt + BATCH_MS;
      if (now - next.fireAt <= GRACE_MS) {
        a.lastRang = now;
        if (a.repeat === "once") a.enabled = false;
        ring(a, next, now);
      }
      if (a.enabled) schedule(a);
      changed = true;
    });
    if (changed) { persist(); emitChange(); }
  }

  // ---- public API ---------------------------------------------------------

  // options: { getSettings(), getData(), storageKey?, autoTick? } - the last
  // two are for tests (an isolated store, and driving tick() by hand).
  function init(options) {
    ctx = options;
    storageKey = options.storageKey || STORAGE_KEY;
    syncSettings();
    load();
    alarms.forEach(schedule);
    if (options.autoTick !== false) setInterval(function () { tick(); }, 1000);
  }

  function find(id) {
    return alarms.find(function (a) { return a.id === id; });
  }

  function add(draft) {
    const a = normalize(Object.assign({}, draft, { id: undefined, armedAfter: Date.now(), lastRang: null, enabled: true, createdAt: Date.now() }));
    if (!a) return null;
    alarms.push(a);
    persist();
    schedule(a);
    emitChange();
    return a;
  }

  function update(id, draft) {
    const old = find(id);
    if (!old) return null;
    const a = normalize(Object.assign({}, draft, { id: id, armedAfter: Date.now(), lastRang: old.lastRang, enabled: true, createdAt: old.createdAt }));
    if (!a) return null;
    alarms[alarms.indexOf(old)] = a;
    persist();
    schedule(a);
    emitChange();
    return a;
  }

  function remove(id) {
    const a = find(id);
    if (!a) return;
    a._token = (a._token || 0) + 1;
    alarms.splice(alarms.indexOf(a), 1);
    persist();
    emitChange();
  }

  function setEnabled(id, on) {
    const a = find(id);
    if (!a) return;
    a.enabled = !!on;
    if (a.enabled) a.armedAfter = Date.now();
    persist();
    schedule(a);
    emitChange();
  }

  // The next `count` times the draft would ring, from now: Promise of
  // [{ fire, id, start, end, detail }].
  function preview(draft, count) {
    const a = normalize(Object.assign({}, draft, { armedAfter: Date.now() }));
    if (!a) return Promise.resolve([]);
    return findFires(specOf(a), Date.now(), count || 1).then(function (found) { return found.slice(0, count || 1); });
  }

  function onChange(fn) { changeListeners.push(fn); }
  function onRing(fn) { ringHandler = fn; }

  // ---- phone calendar export ------------------------------------------------
  // A web page cannot ring once it is closed, but a phone's calendar can: this
  // writes an alarm's next rings as an .ics file (one event per ring, with a
  // reminder at the moment it should sound). Import it once and the phone
  // alerts on its own, with the browser closed.
  const ICS_MAX_RINGS = 40;

  function icsDate(ms) {
    return new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  }
  function icsText(t) {
    return String(t).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  }
  // Lines are limited to 75 octets; a longer one continues on a line starting with a space.
  function icsFold(line) {
    const out = [];
    let cur = "", bytes = 0;
    Array.from(line).forEach(function (ch) {
      const n = new TextEncoder().encode(ch).length;
      if (bytes + n > 74) { out.push(cur); cur = " "; bytes = 1; }
      cur += ch;
      bytes += n;
    });
    out.push(cur);
    return out.join("\r\n");
  }
  function istHM(ms) {
    return new Date(ms + 5.5 * 3600 * 1000).toISOString().slice(11, 16);
  }

  // Resolves { text, count, filename } for the alarm's next rings (up to 40,
  // within the search limit).
  async function buildCalendar(id) {
    const a = find(id);
    if (!a) throw new Error("No such alarm.");
    const known = getCatalog().byId;
    const count = a.repeat === "once" ? 1 : ICS_MAX_RINGS;
    const fires = (await findFires(specOf(a), Date.now(), count)).slice(0, count);
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Vedic Wall Clock//Alarms//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:Vedic Wall Clock alarms"];
    const stamp = icsDate(Date.now());
    fires.forEach(function (f) {
      const item = known.get(f.id);
      const name = f.detail || item.label;
      const verb = a.mode === "end" ? "ends" : item.instant ? "happens" : "begins";
      const lead = a.mode === "before" ? " in " + offsetText(a) : "";
      const summary = "\u{1F514} " + (a.label ? a.label + " - " : "") + name + " " + verb + lead;
      const when = item.instant ? istHM(f.start) + " IST" : istHM(f.start) + " - " + istHM(f.end) + " IST";
      lines.push(
        "BEGIN:VEVENT",
        "UID:" + a.id + "-" + f.fire + "@vedic-wall-clock",
        "DTSTAMP:" + stamp,
        "DTSTART:" + icsDate(f.fire),
        "DTEND:" + icsDate(f.fire + 5 * MIN_MS),
        "SUMMARY:" + icsText(summary),
        "DESCRIPTION:" + icsText(name + " (" + item.groupTitle + "): " + when + ". " + triggerText(a) + "."),
        "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + icsText(summary), "TRIGGER:PT0S", "END:VALARM",
        "END:VEVENT");
    });
    lines.push("END:VCALENDAR");
    const slug = (title(a) || "alarm").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "alarm";
    return { text: lines.map(icsFold).join("\r\n") + "\r\n", count: fires.length, filename: "vedic-alarm-" + slug + ".ics" };
  }

  // ---- wording ------------------------------------------------------------

  function allInstants(ids) {
    const known = getCatalog().byId;
    return ids.length > 0 && ids.every(function (id) { return known.get(id).instant; });
  }

  // "30 min", "1.5 hr", "2 ghaṭī".
  function offsetText(a) {
    return a.offsetValue + " " + UNIT_LABEL[a.offsetUnit];
  }

  // "15 min before the start", "At the end", "At the moment" ...
  function triggerText(a) {
    const instant = allInstants(a.events);
    if (a.mode === "before") return offsetText(a) + (instant ? " before" : " before the start");
    if (a.mode === "end") return instant ? "At the moment" : "At the end";
    return instant ? "At the moment" : "At the start";
  }

  // The events in a few words: a label for one, "All Tithi" when a whole
  // group is picked, and "+ N more" past three.
  function eventsText(ids) {
    const { groups, byId } = getCatalog();
    const chosen = new Set(ids);
    const parts = [];
    groups.forEach(function (g) {
      const picked = g.items.filter(function (it) { return chosen.has(it.id); });
      if (!picked.length) return;
      if (picked.length === g.items.length && picked.length > 1) parts.push("All " + g.title);
      else picked.forEach(function (it) { parts.push(it.label); });
    });
    if (!parts.length) return "";
    return parts.length <= 3 ? parts.join(" · ") : parts.slice(0, 2).join(" · ") + " · +" + (parts.length - 2) + " more";
  }

  function title(a) {
    return a.label || eventsText(a.events);
  }

  // What the UI needs per alarm, including the next ring (undefined while
  // still searching, null if none within the search limit).
  function list() {
    return alarms.map(function (a) {
      return Object.assign({}, serialize(a), {
        title: title(a), eventsText: eventsText(a.events), triggerText: triggerText(a),
        next: a._next,
      });
    });
  }

  VedicEngine.Alarms = {
    init, tick, add, update, remove, setEnabled, preview, list, onChange, onRing, buildCalendar,
    catalog: function () { return getCatalog().groups; },
    catalogItem: function (id) { return getCatalog().byId.get(id); },
    get: function (id) { const a = find(id); return a ? serialize(a) : null; },
    eventsText, triggerText, allInstants,
    UNIT_LABEL, UNIT_MS, GRACE_MS, STORAGE_KEY,
  };
})(typeof window !== "undefined" ? window : globalThis);
