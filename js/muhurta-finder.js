// Find muhurta: picks an event (js/data/mc-events.js) and searches day by
// day for the next times its Muhūrta Cintāmaṇi conditions hold, with the
// day's bad windows and yogas (mc-yogas.js) taken out.
(function (global) {
  "use strict";

  const VedicEngine = global.VedicEngine = global.VedicEngine || {};
  const E = VedicEngine;
  const DAY = 86400000, GH = 24 * 60000, IST = 5.5 * 3600000;
  const MIN_LEN = GH; // a window shorter than one ghaṭī is not offered
  const MAX_DAYS = 730, MAX_RESULTS = 5;

  // ---------------------------------------------------------------------------
  // Interval helpers (plain { s, e } in ms)
  function ov(a, b) { const s = Math.max(a.s, b.s), e = Math.min(a.e, b.e); return e > s ? { s: s, e: e } : null; }
  function minus(list, cut) {
    const out = [];
    list.forEach(function (x) {
      const o = ov(x, cut);
      if (!o) { out.push(x); return; }
      if (o.s > x.s) out.push(Object.assign({}, x, { s: x.s, e: o.s }));
      if (o.e < x.e) out.push(Object.assign({}, x, { s: o.e, e: x.e }));
    });
    return out;
  }
  function within(list, spans) { // keep only the parts of `list` inside any of `spans`
    const out = [];
    list.forEach(function (x) { spans.forEach(function (sp) { const o = ov(x, sp); if (o) out.push(Object.assign({}, x, o, { lagna: sp.lagna != null ? sp.lagna : x.lagna, lagnaNote: sp.note || x.lagnaNote })); }); });
    return out;
  }
  function ms(d) { return d instanceof Date ? d.getTime() : d; }

  // ---------------------------------------------------------------------------
  // Sky helpers
  const A = function () { return global.Astronomy; };
  function sidLon(body, d, s) {
    const As = A();
    const ecl = As.Ecliptic(As.GeoVector(body, d, true));
    return ((ecl.elon - E.Ayanamsa.get(s.ayanamsa, d)) % 360 + 360) % 360;
  }
  function sunSign(d, s) { return Math.floor(E.Sidereal.longitude("sun", d, s.ayanamsa, s.method) / 30); }
  function isSet(bodyName, d) {
    const As = A();
    return As.AngleFromSun(As.Body[bodyName], d) < (bodyName === "Venus" ? 10 : 11);
  }
  // Jupiter or Venus set, "young" or "old" (5.26-28: 15 days for Jupiter; Venus taken as 10).
  function astaReason(d) {
    const t = ms(d);
    if (isSet("Jupiter", d) || isSet("Jupiter", new Date(t - 15 * DAY)) || isSet("Jupiter", new Date(t + 15 * DAY))) return "Jupiter set, young or old (5.26–28)";
    if (isSet("Venus", d) || isSet("Venus", new Date(t - 10 * DAY)) || isSet("Venus", new Date(t + 10 * DAY))) return "Venus set, young or old (5.26–28)";
    return null;
  }
  function planetSigns(d, s) {
    const As = A(), B = As.Body;
    const out = {
      sun: sunSign(d, s), mars: Math.floor(sidLon(B.Mars, d, s) / 30), mercury: Math.floor(sidLon(B.Mercury, d, s) / 30),
      jupiter: Math.floor(sidLon(B.Jupiter, d, s) / 30), venus: Math.floor(sidLon(B.Venus, d, s) / 30), saturn: Math.floor(sidLon(B.Saturn, d, s) / 30),
    };
    const T = (ms(d) / DAY + 2440587.5 - 2451545.0) / 36525;
    const rahu = (((125.04452 - 1934.136261 * T) - E.Ayanamsa.get(s.ayanamsa, d)) % 360 + 360) % 360;
    out.rahu = Math.floor(rahu / 30);
    out.ketu = (out.rahu + 6) % 12;
    return out;
  }
  const MALEFICS = ["sun", "mars", "saturn", "rahu", "ketu"], BENEFICS = ["jupiter", "venus", "mercury"];
  const PLANET_NAME = { sun: "Sun", moon: "Moon", mars: "Mars", mercury: "Mercury", jupiter: "Jupiter", venus: "Venus", saturn: "Saturn", rahu: "Rāhu", ketu: "Ketu" };

  // The standard lagna (6.44-48 and the md's "standard lagna"): returns a
  // reason string when it fails, else { note } describing its strengths.
  function judgeLagna(lagna, signs, ev) {
    const house = function (sign) { return ((sign - lagna + 12) % 12) + 1; };
    const occ = {};
    Object.keys(signs).forEach(function (p) { const h = house(signs[p]); (occ[h] = occ[h] || []).push(p); });
    if (ev.stdLagna) {
      if (occ[8]) return { fail: "a planet in the 8th (" + occ[8].map(function (p) { return PLANET_NAME[p]; }).join(", ") + ")" };
      const mh = house(signs.moon);
      if ([6, 8, 12].indexOf(mh) !== -1) return { fail: "the Moon in the " + mh + "th (6.44–48)" };
      if ((occ[1] || []).some(function (p) { return MALEFICS.indexOf(p) !== -1; })) return { fail: "a malefic in the lagna" };
      const m12 = (occ[12] || []).some(function (p) { return MALEFICS.indexOf(p) !== -1; }), m2 = (occ[2] || []).some(function (p) { return MALEFICS.indexOf(p) !== -1; });
      if (m12 && m2) return { fail: "kartari: malefics on both sides of the lagna (6.44)" };
    }
    if (ev.jamitra && occ[7]) return { fail: "a planet in the 7th (jāmitra, 6.81–87)" };
    if (ev.moonNotInLagna && house(signs.moon) === 1) return { fail: "the Moon in the lagna" };
    const good = [];
    BENEFICS.forEach(function (p) { const h = house(signs[p]); if ([1, 4, 7, 10, 5, 9].indexOf(h) !== -1) good.push(PLANET_NAME[p] + " in " + h); });
    MALEFICS.forEach(function (p) { const h = house(signs[p]); if ([3, 6, 11].indexOf(h) !== -1) good.push(PLANET_NAME[p] + " in " + h); });
    return { note: good.length ? good.join(", ") : "", score: good.length };
  }

  // ---------------------------------------------------------------------------
  // Range-wide caches
  function buildCaches(fromMs, toMs, s) {
    const As = A(), cache = { eclipses: [], sankrantis: [], adhika: {} };
    try {
      const obs = new As.Observer(s.location.latitude, s.location.longitude, s.location.elevation || 0);
      let le = As.SearchLunarEclipse(new Date(fromMs - 12 * DAY));
      for (let k = 0; k < 12 && ms(le.peak.date) < toMs + 4 * DAY; k++) {
        if (le.kind !== "penumbral") cache.eclipses.push(ms(le.peak.date));
        le = As.NextLunarEclipse(le.peak);
      }
      let se = As.SearchLocalSolarEclipse(new Date(fromMs - 12 * DAY), obs);
      for (let k = 0; k < 12 && ms(se.peak.time.date) < toMs + 4 * DAY; k++) {
        if (se.peak.altitude > 0) cache.eclipses.push(ms(se.peak.time.date));
        se = As.NextLocalSolarEclipse(se.peak.time, obs);
      }
    } catch (e) { /* eclipses unavailable */ }
    // Saṅkrāntis: the Sun crossing each 30° of sidereal longitude.
    let t = new Date(fromMs - 2 * DAY);
    const sunAngle = function (d) { return E.Sidereal.longitude("sun", d, s.ayanamsa, s.method); };
    for (let k = 0; k < 30 && ms(t) < toMs + 2 * DAY; k++) {
      const next = (Math.floor(sunAngle(t) / 30) + 1) % 12;
      const c = E.Util.findAngleCrossing(sunAngle, t, next * 30, { direction: 1, stepMinutes: 720, maxDays: 33 });
      if (!c) break;
      cache.sankrantis.push({ t: ms(c), rashi: next });
      t = new Date(ms(c) + DAY);
    }
    return cache;
  }
  function isAdhika(snapshot, cache) {
    const s = snapshot.settings;
    const next = E.Masa.amantaMasaForDate(snapshot.anchors.governingSunrise, s.ayanamsa, s.method);
    const key = Math.round(ms(next.nextNewMoon) / DAY);
    if (cache.adhika[key] == null) {
      const prev = E.Masa.amantaMasaForDate(new Date(ms(next.nextNewMoon) - 32 * DAY), s.ayanamsa, s.method);
      cache.adhika[key] = prev.rashiIndex === next.rashiIndex;
    }
    return cache.adhika[key];
  }

  // ---------------------------------------------------------------------------
  // One day
  const TRAVEL_ANY_TIME = [21, 12, 7, 4];
  function travelTimeSpan(nak, P) {
    if (TRAVEL_ANY_TIME.indexOf(nak) !== -1) return null;
    const C = E.MCEvents.NCLASS, dl = P.set - P.rise, mid = (P.set + P.next) / 2;
    if (C.dhruva.indexOf(nak) !== -1 || C.mishra.indexOf(nak) !== -1) return { s: P.rise, e: (P.rise + P.set) / 2, label: "forenoon" };
    if (C.tikshna.indexOf(nak) !== -1) return { s: P.rise + 0.4 * dl, e: P.rise + 0.6 * dl, label: "midday" };
    if (C.ugra.indexOf(nak) !== -1) return { s: (P.rise + P.set) / 2, e: P.set, label: "afternoon" };
    if (C.laghu.indexOf(nak) !== -1) return { s: P.set, e: mid, label: "the first part of the night" };
    if (C.mridu.indexOf(nak) !== -1) return { s: mid - 1.5 * 3600000, e: mid + 1.5 * 3600000, label: "midnight" };
    if (C.chara.indexOf(nak) !== -1) return { s: mid, e: P.next, label: "the end of the night" };
    return null;
  }
  const LEFT_OF = { east: "north", south: "east", west: "south", north: "west" };

  function evaluateDay(ev, snapshot, data, opts, cache) {
    const s = snapshot.settings, a = snapshot.anchors, v = snapshot.varaIndex, M = E.MCEvents;
    const P = { rise: ms(a.governingSunrise), set: ms(a.sunsetToday), next: ms(a.nextSunrise) };
    const noon = new Date((P.rise + P.set) / 2);
    const vara = data.vara.names[v];
    if (ev.badVaras && ev.badVaras.indexOf(v) !== -1) return { reject: "weekday (" + vara + ")" };
    if (ev.varas && ev.varas.indexOf(v) === -1 && !(ev.midVaras && ev.midVaras.indexOf(v) !== -1)) return { reject: "weekday (" + vara + ")" };
    const sun = sunSign(noon, s);
    if (ev.uttarayana && [9, 10, 11, 0, 1, 2].indexOf(sun) === -1) return { reject: "Dakṣiṇāyana (5.26)" };
    if (ev.sunSigns && ev.sunSigns.indexOf(sun) === -1) return { reject: "the Sun in " + data.rashi.names[sun] };
    if (ev.direction && M.dishashula[v] === ev.direction) return { reject: "dishāśūla: no travel " + ev.direction + " on " + vara };
    const auspicious = ev.auspicious !== false;
    if (auspicious) {
      const ecl = cache.eclipses.find(function (t) { return P.rise > t - 3 * DAY && P.rise < t + 10 * DAY; });
      if (ecl) return { reject: "near an eclipse (1.32, 5.26)" };
    }
    if (ev.noAsta) { const r = astaReason(noon); if (r) return { reject: r }; }
    if (ev.noAdhika && isAdhika(snapshot, cache)) return { reject: "adhika māsa" };
    if (ev.noSankrantiDay && cache.sankrantis.some(function (x) { return x.t >= P.rise && x.t < P.next; })) return { reject: "a saṅkrānti day (2.27)" };

    // Tithi spans that qualify.
    let windows = [];
    const tithiSpans = [];
    snapshot.tithiSequence.forEach(function (t) {
      const span = { s: ms(t.segStart), e: ms(t.segEnd) };
      const n = t.number, pi = t.pakshaIndex, masa = t.amantaMasaRashiIndex;
      if (ev.shukla && t.paksha !== "shukla") return;
      if (ev.krishnaOnly && t.paksha !== "krishna") return;
      if (ev.tithis && ev.tithis.indexOf(n) === -1) return;
      if (ev.badTithis && ev.badTithis.indexOf(n) !== -1) return;
      if (ev.masas && ev.masas.indexOf(masa) === -1) return;
      if (ev.badMasas && ev.badMasas.indexOf(masa) !== -1) return;
      if (ev.noHariShayana && ((masa === 3 && (t.paksha === "krishna" || pi >= 11)) || masa === 4 || masa === 5 || masa === 6 || (masa === 7 && t.paksha === "shukla" && pi < 11))) return;
      if (ev.marriageAshadha && masa === 3 && (t.paksha === "krishna" || pi > 10)) return;
      if (auspicious && M.dagdhaBySun[sun] === pi && pi !== 15) return;
      if (ev.direction) {
        const yd = M.yogini[pi] || (n === 30 ? "northeast" : null);
        if (yd === ev.direction || yd === LEFT_OF[ev.direction]) return;
      }
      if (ev.agniVasa) { const ag = (n + 1 + v + 1) % 4; if (ag === 1 || ag === 2) return; }
      tithiSpans.push(Object.assign(span, { tithi: t }));
    });
    if (!tithiSpans.length) return { reject: "tithi" };

    const sun28 = snapshot.sunNakshatraIndex < 21 ? snapshot.sunNakshatraIndex : snapshot.sunNakshatraIndex + 1;
    snapshot.nakshatraSequence.forEach(function (nk) {
      let span = { s: ms(nk.segStart), e: ms(nk.segEnd) };
      const i = nk.index;
      if (ev.badNaks && ev.badNaks.indexOf(i) !== -1) return;
      const mid = ev.midNaks && ev.midNaks.indexOf(i) !== -1;
      if (ev.naks && ev.naks.indexOf(i) === -1 && !mid) return;
      if (ev.chakra) {
        const m28 = i < 21 ? i : i + 1, c = ((m28 - sun28 + 28) % 28) + 1;
        if (!ev.chakra.good.some(function (r) { return c >= r[0] && c <= r[1]; })) return;
      }
      if (ev.homaMouth) { const g = Math.floor(((((i - snapshot.sunNakshatraIndex + 27) % 27) + 1) - 1) / 3); if ([0, 3, 5, 7, 8].indexOf(g) !== -1) return; }
      if (ev.noPanchaka && i >= 22) { if (i > 22) return; span.e = Math.min(span.e, (ms(nk.startTime) + ms(nk.endTime)) / 2); }
      if (ev.direction && M.nakSide(i) !== ev.direction && M.anyDirection.indexOf(i) === -1) return;
      if (ev.travel) { const tt = travelTimeSpan(i, P); if (tt) { const o = ov(span, tt); if (!o) return; span = Object.assign(o, { timeNote: tt.label }); } }
      if (ev.noSunHasta && v === 0 && i === 12) return;
      tithiSpans.forEach(function (ts) {
        const o = ov(span, ts);
        if (o) windows.push(Object.assign(o, { nak: i, mid: mid, tithi: ts.tithi, timeNote: span.timeNote }));
      });
    });
    if (!windows.length) return { reject: "nakṣatra" };

    // Time of day.
    if (ev.time === "day") windows = within(windows, [{ s: P.rise, e: P.set }]);
    if (ev.time === "night") windows = within(windows, [{ s: P.set, e: P.next }]);
    if (ev.time === "forenoon") windows = within(windows, [{ s: P.rise, e: (P.rise + P.set) / 2 }]);
    if (!windows.length) return { reject: "time of day" };

    // Bad windows.
    const cuts = [];
    if (auspicious && E.MCYogas) {
      E.MCYogas.mainWindows(snapshot, data, opts).forEach(function (w) { if (w.goodBad === "bad") cuts.push({ s: ms(w.startTime), e: ms(w.endTime) }); });
      E.MCYogas.secondary(snapshot, data, opts).windows.forEach(function (w) { if (w.goodBad === "bad") cuts.push({ s: ms(w.startTime), e: ms(w.endTime) }); });
      cache.sankrantis.forEach(function (x) { if (x.t > P.rise - 8 * GH * 2 && x.t < P.next + 16 * GH) cuts.push({ s: x.t - 16 * GH, e: x.t + 16 * GH }); });
    }
    if (ev.noTripushkara && E.MCYogas) E.MCYogas.secondary(snapshot, data, opts).windows.forEach(function (w) { if (w.text === "Tripuṣkara") cuts.push({ s: ms(w.startTime), e: ms(w.endTime) }); });
    if (ev.vishaghati) snapshot.nakshatraSequence.forEach(function (nk) {
      const g = (ms(nk.endTime) - ms(nk.startTime)) / 60, st = ms(nk.startTime) + M.vishaghatiStart[nk.index] * g;
      cuts.push({ s: st, e: st + 4 * g });
    });
    if (ev.durmuhurta) M.durmuhurta[v].forEach(function (k) { const m = snapshot.scaledRings.muhurta.day[k - 1]; if (m) cuts.push({ s: ms(m.startTime), e: ms(m.endTime) }); });
    if (ev.noVriddhiYoga) snapshot.yogaSequence.forEach(function (y) { if (y.index === 10) cuts.push({ s: ms(y.segStart), e: ms(y.segEnd) }); });
    cuts.forEach(function (c) { windows = minus(windows, c); });
    if (!windows.filter(function (w) { return w.e - w.s >= MIN_LEN; }).length) return { reject: "bad windows and yogas" };

    // Lagna.
    const needsLagna = ev.lagnas || ev.badLagnas || ev.stdLagna || ev.jamitra || ev.badLagnasDay || ev.moonNotInLagna;
    if (needsLagna) {
      const signs = planetSigns(noon, s);
      const ok = [];
      let lastFail = "lagna";
      snapshot.lagnaSequence.forEach(function (l) {
        const span = { s: ms(l.segStart), e: ms(l.segEnd) };
        if (ev.lagnas && ev.lagnas.indexOf(l.index) === -1) return;
        if (ev.badLagnas && ev.badLagnas.indexOf(l.index) !== -1) return;
        const midT = new Date((span.s + span.e) / 2);
        const sg = Object.assign({}, signs, { moon: Math.floor(E.Sidereal.longitude("moon", midT, s.ayanamsa, s.method) / 30) });
        const j = judgeLagna(l.index, sg, ev);
        if (j.fail) { lastFail = "lagna: " + j.fail; return; }
        const pieces = [];
        if (ev.badLagnasDay || ev.badLagnasNight) {
          const day = ov(span, { s: P.rise, e: P.set }), night = minus([span], { s: P.rise, e: P.set });
          if (day && ev.badLagnasDay.indexOf(l.index) === -1) pieces.push(day);
          night.forEach(function (n) { if (ev.badLagnasNight.indexOf(l.index) === -1) pieces.push(n); });
        } else pieces.push(span);
        pieces.forEach(function (p) { ok.push(Object.assign(p, { lagna: l.index, note: j.note })); });
      });
      windows = within(windows, ok);
      if (!windows.filter(function (w) { return w.e - w.s >= MIN_LEN; }).length) return { reject: lastFail };
    }

    windows = windows.filter(function (w) { return w.e - w.s >= MIN_LEN; }).sort(function (x, y) { return x.s - y.s; });
    // Join pieces that touch.
    const joined = [];
    windows.forEach(function (w) {
      const last = joined[joined.length - 1];
      if (last && w.s - last.e <= 60000 && last.nak === w.nak && last.tithi === w.tithi && last.lagna === w.lagna) last.e = Math.max(last.e, w.e);
      else joined.push(w);
    });
    return { windows: joined };
  }

  // Saṅkrānti puṇya-kāla (3.5-8).
  function sankrantiWindows(fromMs, toMs, s, data) {
    const cache = buildCaches(fromMs, toMs, s), out = [];
    cache.sankrantis.forEach(function (x) {
      if (x.t < fromMs || x.t > toMs || out.length >= MAX_RESULTS) return;
      const r = x.rashi;
      let w;
      if (r === 0 || r === 6) w = { s: x.t - 16 * GH, e: x.t + 16 * GH, rule: "16 ghaṭīs either side (viṣuva)" };
      else if ([1, 3, 4, 7, 10].indexOf(r) !== -1) w = { s: x.t - 16 * GH, e: x.t, rule: "the 16 ghaṭīs before" };
      else w = { s: x.t, e: x.t + 16 * GH, rule: "the 16 ghaṭīs after" };
      const rise = E.Sunrise.sunriseAtOrBefore(s.location, new Date(x.t), s.sunriseEdge);
      const set = rise && E.Sunrise.sunsetAfter(s.location, rise, s.sunriseEdge);
      let night = "";
      if (rise && set && x.t > ms(set)) {
        const nextRise = E.Sunrise.sunriseAfter(s.location, rise, s.sunriseEdge);
        const midnight = (ms(set) + ms(nextRise)) / 2;
        if (x.t < midnight) { w = { s: (ms(rise) + ms(set)) / 2, e: ms(set), rule: "at night before midnight: the second half of that day" }; }
        else { const nset = E.Sunrise.sunsetAfter(s.location, nextRise, s.sunriseEdge); w = { s: ms(nextRise), e: (ms(nextRise) + ms(nset)) / 2, rule: "at night after midnight: the first half of the next day" }; }
        night = " No bathing or gifts at night (3.5–6).";
      }
      out.push({ day: w.s, windows: [{ s: w.s, e: w.e, text: data.rashi.names[r] + " saṅkrānti at " + fmtTime(x.t) + " " + fmtDate(x.t) + ": " + w.rule + " (3.5–8)." + night }] });
    });
    return out;
  }

  // ---------------------------------------------------------------------------
  function fmtTime(t) { return new Date(t).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: false, hour: "2-digit", minute: "2-digit" }); }
  function fmtDate(t) { return new Date(t).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", year: "numeric" }); }
  function istDayStart(t) { return Math.floor((t + IST) / DAY) * DAY - IST; }

  // Searches [fromMs, toMs]; calls onProgress(dayMs) and resolves with
  // { results: [{ day, windows }], rejects: { reason: count }, days }.
  async function search(ev, fromMs, toMs, getSettings, data, opts, onProgress, isCancelled) {
    const s = E.Panchanga.mergeSettings(getSettings());
    if (ev.sankranti) return { results: sankrantiWindows(fromMs, toMs, s, data), rejects: {}, days: 0 };
    const cache = buildCaches(fromMs, toMs, s);
    const results = [], rejects = {};
    let day = istDayStart(fromMs), n = 0;
    while (day <= toMs && n < MAX_DAYS && results.length < MAX_RESULTS) {
      if (isCancelled && isCancelled()) return null;
      const snap = E.Panchanga.compute(new Date(day + 12 * 3600000), s);
      let r;
      try { r = evaluateDay(ev, snap, data, opts, cache); } catch (err) { console.error("Find muhurta:", err); r = { reject: "error" }; }
      if (r.reject) rejects[r.reject] = (rejects[r.reject] || 0) + 1;
      else {
        const w = r.windows.filter(function (x) { return x.e > fromMs && x.s < toMs; }).map(function (x) { return Object.assign({}, x, { s: Math.max(x.s, fromMs), e: Math.min(x.e, toMs) }); }).filter(function (x) { return x.e - x.s >= MIN_LEN; });
        if (w.length) results.push({ day: day, snapshot: snap, windows: w });
        else rejects["outside the range"] = (rejects["outside the range"] || 0) + 1;
      }
      n++;
      day += DAY;
      if (onProgress) onProgress(day, results.length);
      await new Promise(function (res) { setTimeout(res, 0); });
    }
    return { results: results, rejects: rejects, days: n };
  }

  // ---------------------------------------------------------------------------
  // The dialog
  let ctx = null, chosen = null, mode = "after", dateA = null, dateB = null, runId = 0;
  function $(id) { return document.getElementById(id); }
  function h(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function allEvents() {
    const out = [];
    E.MCEvents.groups.forEach(function (g) { g.events.forEach(function (ev) { out.push(Object.assign({ group: g.title }, ev)); }); });
    return out;
  }
  function fold(s) { return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }
  function dateLabel(v) { return v ? new Date(v + "T00:00:00Z").toLocaleDateString("en-IN", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" }) : "pick a date"; }
  function dateMs(v) { return Date.UTC(+v.slice(0, 4), +v.slice(5, 7) - 1, +v.slice(8, 10)) - IST; }

  function renderList() {
    const q = fold($("mf-search").value.trim());
    const ul = $("mf-list");
    ul.textContent = "";
    let lastGroup = null, count = 0;
    allEvents().forEach(function (ev) {
      if (q && fold(ev.name + " " + ev.group).indexOf(q) === -1) return;
      if (ev.group !== lastGroup) { ul.appendChild(h("li", "mf-group", ev.group)); lastGroup = ev.group; }
      const li = h("li", "mf-item");
      li.setAttribute("role", "option");
      li.dataset.id = ev.id;
      li.appendChild(h("span", "mf-name", ev.name));
      li.appendChild(h("span", "mf-ref", ev.ref));
      if (chosen && chosen.id === ev.id) li.setAttribute("aria-selected", "true");
      ul.appendChild(li);
      count++;
    });
    if (!count) ul.appendChild(h("li", "mf-empty", "No event matches."));
  }
  function openList(on) { $("mf-list").hidden = !on; $("mf-search").setAttribute("aria-expanded", String(on)); }

  function renderRange() {
    document.querySelectorAll("#mf-mode button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.mode === mode)); });
    const btn = $("mf-date");
    if (mode === "between") btn.textContent = dateA && dateB ? dateLabel(dateA) + " – " + dateLabel(dateB) : dateA ? dateLabel(dateA) + " – …" : "Pick the two dates";
    else btn.textContent = dateLabel(dateA);
  }
  function pickDates() {
    const P = E.DatePicker, btn = $("mf-date");
    if (mode === "between") {
      P.open({ anchor: btn, title: "From", value: dateA, onPick: function (a) {
        dateA = a; renderRange();
        dateB = null; renderRange();
        P.open({ anchor: btn, title: "To", value: null, marked: [a], min: a, onPick: function (b) { dateB = b; renderRange(); } });
      } });
    } else {
      P.open({ anchor: btn, title: mode === "after" ? "From this date" : "Up to this date", value: dateA, onPick: function (v) { dateA = v; renderRange(); } });
    }
  }

  function rangeMs() {
    const today = istDayStart(Date.now());
    if (mode === "after") return { from: Math.max(Date.now(), dateA ? dateMs(dateA) : 0), to: (dateA ? dateMs(dateA) : today) + 365 * DAY };
    if (mode === "before") return { from: Date.now(), to: (dateA ? dateMs(dateA) : today) + DAY };
    if (!dateA || !dateB) return null;
    return { from: dateMs(dateA), to: dateMs(dateB) + DAY };
  }

  async function run() {
    const out = $("mf-results");
    out.textContent = "";
    if (!chosen) { out.appendChild(h("p", "ld-note", "Choose an event first.")); return; }
    const r = rangeMs();
    if (!r) { out.appendChild(h("p", "ld-note", "Pick the two dates.")); return; }
    if (r.to <= r.from) { out.appendChild(h("p", "ld-note", "That range has no days left in it.")); return; }
    const id = ++runId;
    const status = h("p", "mf-status", "Searching…");
    out.appendChild(status);
    $("mf-find").disabled = true;
    const res = await search(chosen, r.from, Math.min(r.to, r.from + MAX_DAYS * DAY), ctx.getSettings, ctx.getData(), ctx.getOpts(),
      function (day, found) { status.textContent = "Searching… " + fmtDate(day) + (found ? " · " + found + " found" : ""); },
      function () { return id !== runId; });
    $("mf-find").disabled = false;
    if (!res || id !== runId) return;
    out.textContent = "";
    const data = ctx.getData();
    if (!res.results.length) {
      out.appendChild(h("p", "mf-status", "No suitable time in this range."));
      const reasons = Object.keys(res.rejects).sort(function (x, y) { return res.rejects[y] - res.rejects[x]; }).slice(0, 5);
      if (reasons.length) out.appendChild(h("p", "ld-note", "Days ruled out by: " + reasons.map(function (k) { return k + " (" + res.rejects[k] + ")"; }).join("; ") + "."));
    }
    res.results.forEach(function (day) {
      const card = h("div", "mf-day");
      card.appendChild(h("div", "mf-date-head", fmtDate(day.windows[0].s)));
      day.windows.forEach(function (w) {
        const row = h("div", "mf-win");
        const g1 = day.snapshot ? E.Ghati.current(new Date(w.s), day.snapshot.anchors) : null, g2 = day.snapshot ? E.Ghati.current(new Date(w.e), day.snapshot.anchors) : null;
        const head = h("div", "mf-time", fmtTime(w.s) + "–" + fmtTime(w.e) + E.RingAdapter.dateNote(new Date(w.e), day.snapshot ? day.snapshot.anchors : { governingSunrise: new Date(w.s) }) +
          (g1 && g2 ? "  ·  ghaṭī " + g1.ghati + ":" + String(g1.pala).padStart(2, "0") + "–" + g2.ghati + ":" + String(g2.pala).padStart(2, "0") : ""));
        row.appendChild(head);
        const why = [];
        if (w.text) why.push(w.text);
        if (w.tithi) why.push(E.RingAdapter.tithiNameAt({ tithiSequence: [w.tithi] }, data, new Date(w.s)));
        if (w.nak != null) why.push(data.nakshatra.names[w.nak] + (w.mid ? " (middling)" : ""));
        if (day.snapshot && !w.text) why.push(data.vara.names[day.snapshot.varaIndex]);
        if (w.lagna != null) why.push(data.rashi.names[w.lagna] + " lagna" + (w.lagnaNote ? " (" + w.lagnaNote + ")" : ""));
        if (w.timeNote) why.push("travel in " + w.timeNote + " for this nakṣatra (11.11)");
        row.appendChild(h("div", "mf-why", why.join(" · ")));
        const go = h("button", "mf-go", "Show on the clock");
        go.type = "button";
        go.addEventListener("click", function () { ctx.goTo(new Date(w.s + 60000)); close(); });
        row.appendChild(go);
        card.appendChild(row);
      });
      out.appendChild(card);
    });
    const notes = h("p", "ld-note mf-notes");
    notes.textContent = (chosen.checkNote ? "Also check (not computed): " + chosen.checkNote + " " : "") +
      "Not computed for any event: rules that need birth details (janma nakṣatra, tārā, the Moon from the janma rāśi), portents, and navāṃśa." + (chosen.auspicious === false ? "" : " Taken out: the day's bad windows and yogas, ±16 ghaṭīs of saṅkrānti, dagdha tithis by the Sun's sign (6.66), and 3 days before to 10 days after an eclipse.");
    out.appendChild(notes);
  }

  function close() { runId++; $("mf-dialog").classList.add("hidden"); $("btn-next-muhurta").focus(); }
  function choose(id) {
    chosen = allEvents().find(function (ev) { return ev.id === id; }) || null;
    $("mf-search").value = chosen ? chosen.name : "";
    openList(false);
    $("mf-ref").textContent = chosen ? "Muhūrta Cintāmaṇi " + chosen.ref : "";
  }

  function init(c) {
    ctx = c;
    $("btn-next-muhurta").addEventListener("click", function () {
      $("mf-dialog").classList.remove("hidden");
      if (!dateA) dateA = E.DatePicker.todayIST();
      renderRange(); renderList();
      $("mf-search").focus();
    });
    $("mf-close").addEventListener("click", close);
    $("mf-dialog").addEventListener("click", function (e) {
      if (e.target === $("mf-dialog")) close();
      if (!e.target.closest(".mf-combo")) openList(false);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !$("mf-dialog").classList.contains("hidden") && !E.DatePicker.isOpen()) {
        if (!$("mf-list").hidden) openList(false); else close();
      }
    });
    const search = $("mf-search");
    search.addEventListener("focus", function () { renderList(); openList(true); });
    search.addEventListener("input", function () { chosen = null; $("mf-ref").textContent = ""; renderList(); openList(true); });
    search.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { const first = $("mf-list").querySelector(".mf-item"); if (first) { e.preventDefault(); choose(first.dataset.id); } }
    });
    $("mf-list").addEventListener("click", function (e) { const li = e.target.closest(".mf-item"); if (li) choose(li.dataset.id); });
    $("mf-mode").addEventListener("click", function (e) {
      const b = e.target.closest("button");
      if (!b) return;
      mode = b.dataset.mode;
      if (mode === "between") { dateA = null; dateB = null; renderRange(); pickDates(); } else { if (!dateA) dateA = E.DatePicker.todayIST(); renderRange(); }
    });
    $("mf-date").addEventListener("click", pickDates);
    $("mf-find").addEventListener("click", run);
  }

  VedicEngine.MuhurtaFinder = { init: init, search: search, evaluateDay: evaluateDay };
})(typeof window !== "undefined" ? window : globalThis);
