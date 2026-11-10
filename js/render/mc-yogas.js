// Muhūrta Cintāmaṇi rules (Prakaraṇas 1-2) evaluated for one Vedic day, from
// the tables in js/data/mc-data.js:
//   mainWindows()  small daily windows, for the Good / Bad Times ring
//   secondary()    tithi-vāra-nakṣatra yogas, for the Secondary yogas view
//   todaySpecial() tithi / nakṣatra details and planetary bars, for the
//                  Today Details dialog
// Each window is { startTime, endTime, text, goodBad, tip }, goodBad being
// "good" or "bad". A bad yoga the text relaxes in part (acceptable if the
// work is urgent, or cancelled by a good yoga) stays whole and carries
// `relief`: [{ startTime, endTime, reasons }], drawn crossed out on the dial.
// Apavādas (relaxations) and cancellations are applied here; the reasons go
// into `tip`, shown in the segment's tooltip.
//
// Ghaṭīs here are clock ghaṭīs (24 minutes) unless a rule says the span is
// scaled to the tithi (Bhadrā's mouth and tail, 1.44).
(function (global) {
  "use strict";

  const VedicEngine = global.VedicEngine = global.VedicEngine || {};
  const GH = 24 * 60 * 1000;

  function D() { return VedicEngine.MCData; }
  function nakName(data, i) { return i === 27 ? "Abhijit" : data.nakshatra.names[i]; }
  function classOf(pi) { return (pi - 1) % 5; } // 0 nandā .. 4 pūrṇā
  function ms(d) { return d.getTime(); }
  function iv(start, end) { return { startTime: new Date(start), endTime: new Date(end) }; }
  function overlap(a, b) {
    const s = Math.max(ms(a.startTime), ms(b.startTime)), e = Math.min(ms(a.endTime), ms(b.endTime));
    return e > s ? iv(s, e) : null;
  }
  function win(span, text, goodBad, tip) {
    return { startTime: span.startTime, endTime: span.endTime, text: text, goodBad: goodBad, tip: tip || "" };
  }
  function tithiLabel(data, t) {
    const n = t.pakshaIndex === 15 ? (t.paksha === "shukla" ? "Pūrṇimā" : "Amāvāsyā") : data.tithi.names[t.pakshaIndex - 1];
    return (t.paksha === "shukla" ? "Śukla " : "Kṛṣṇa ") + n;
  }

  // ---- Regions -------------------------------------------------------------
  // The place's nearest district (from the India places list) and the
  // text's regions it falls in (mc-data.js `regions`).
  function regionsFor(location) {
    const P = VedicEngine.IndiaPlacesData;
    let best = null, bestD = Infinity;
    if (P && P.districts) {
      const cosLat = Math.cos(location.latitude * Math.PI / 180);
      P.districts.forEach(function (st) {
        st[1].forEach(function (d) {
          const dy = d[1] - location.latitude, dx = (d[2] - location.longitude) * cosLat;
          const dist = dx * dx + dy * dy;
          if (dist < bestD) { bestD = dist; best = { state: st[0], district: d[0] }; }
        });
      });
    }
    // Further than ~2 degrees (~220 km) from every district: outside India.
    if (best && Math.sqrt(bestD) > 2) best = null;
    const keys = [];
    const R = D().regions;
    Object.keys(R).forEach(function (k) {
      const r = R[k];
      let inPlace = false;
      if (best) {
        if (r.states && r.states.indexOf(best.state) !== -1) inPlace = true;
        if (r.districts && r.districts[best.state] && r.districts[best.state].indexOf(best.district) !== -1) inPlace = true;
        if (!r.states && !r.districts) inPlace = true; // band-only regions (within India)
      }
      if (inPlace && r.latMin != null && location.latitude < r.latMin) inPlace = false;
      if (inPlace && r.latMax != null && location.latitude > r.latMax) inPlace = false;
      if (inPlace && r.lonMin != null && location.longitude < r.lonMin) inPlace = false;
      if (inPlace && r.lonMax != null && location.longitude > r.lonMax) inPlace = false;
      if (inPlace) keys.push(k);
    });
    return { keys: keys, state: best && best.state, district: best && best.district };
  }

  function ctxFor(snapshot, opts) {
    opts = opts || {};
    const loc = snapshot.settings.location;
    const reg = regionsFor(loc);
    const regional = opts.regionalLimits !== false;
    return {
      opts: opts,
      region: reg,
      // True if a rule limited to `keys` regions applies here.
      inRegion: function (keys) { return !regional || keys.some(function (k) { return reg.keys.indexOf(k) !== -1; }); },
      regionNames: function (keys) { return keys.map(function (k) { return D().regions[k].name; }).join(", "); },
      suppressed: [], // regional rules that hold today but not here
    };
  }

  // Vedic-day helpers.
  function dayParts(snapshot) {
    const a = snapshot.anchors;
    const rise = ms(a.governingSunrise), set = ms(a.sunsetToday), next = ms(a.nextSunrise);
    return {
      rise: rise, set: set, next: next,
      day: iv(rise, set), night: iv(set, next), whole: iv(rise, next),
      firstYama: iv(rise, rise + (set - rise) / 4),
      afterNoon: iv((rise + set) / 2, next),
    };
  }
  function masaAt(snapshot, t) {
    const seq = snapshot.tithiSequence;
    for (let i = 0; i < seq.length; i++) if (t >= ms(seq[i].segStart) && t < ms(seq[i].segEnd)) return seq[i].amantaMasaRashiIndex;
    return seq[seq.length - 1].amantaMasaRashiIndex;
  }
  function tithiSegs(snapshot) {
    return snapshot.tithiSequence.map(function (t) { return Object.assign(iv(ms(t.segStart), ms(t.segEnd)), { t: t }); });
  }
  function nakSegs(snapshot) {
    return snapshot.nakshatraSequence.map(function (n) { return Object.assign(iv(ms(n.segStart), ms(n.segEnd)), { n: n }); });
  }
  // The day's nakṣatra spans in the 28-fold list: Abhijit is the last
  // quarter of Uttarāṣāḍhā plus the first 1/15 of Śravaṇa (2.1).
  function nak28Segs(snapshot) {
    const out = [];
    snapshot.nakshatraSequence.forEach(function (n) {
      const s = ms(n.startTime), e = ms(n.endTime), len = e - s;
      const clip = iv(ms(n.segStart), ms(n.segEnd));
      let parts;
      if (n.index === 20) parts = [[s, s + 0.75 * len, 20], [s + 0.75 * len, e, 21]];
      else if (n.index === 21) parts = [[s, s + len / 15, 21], [s + len / 15, e, 22]];
      else parts = [[s, e, n.index < 21 ? n.index : n.index + 1]];
      parts.forEach(function (p) {
        const o = overlap(iv(p[0], p[1]), clip);
        if (o) out.push(Object.assign(o, { idx28: p[2] }));
      });
    });
    return out;
  }
  function name28(data, i) { return i === 21 ? "Abhijit" : data.nakshatra.names[i < 21 ? i : i - 1]; }

  // Applies `reliefs` ([{ span, reason }]) to the bad window `w` without
  // cutting it: it stays one window, keeps its colour, and gets a `relief`
  // list ([{ startTime, endTime, reasons }]) of the parts a relief covers,
  // which the dial draws crossed out. The reasons, with their times, go in
  // the tip. Returns a one-element array (callers forEach over it).
  function relieve(w, reliefs) {
    const cuts = [ms(w.startTime), ms(w.endTime)];
    reliefs.forEach(function (r) {
      [ms(r.span.startTime), ms(r.span.endTime)].forEach(function (t) { if (t > cuts[0] && t < cuts[1] && cuts.indexOf(t) === -1) cuts.push(t); });
    });
    cuts.sort(function (a, b) { return a - b; });
    const parts = [];
    for (let i = 0; i + 1 < cuts.length; i++) {
      const mid = (cuts[i] + cuts[i + 1]) / 2;
      const why = reliefs.filter(function (r) { return mid >= ms(r.span.startTime) && mid < ms(r.span.endTime); }).map(function (r) { return r.reason; });
      const reasons = why.filter(function (x, j) { return why.indexOf(x) === j; });
      if (!reasons.length) continue;
      const last = parts[parts.length - 1];
      if (last && ms(last.endTime) === cuts[i] && last.reasons.join("|") === reasons.join("|")) last.endTime = new Date(cuts[i + 1]);
      else parts.push({ startTime: new Date(cuts[i]), endTime: new Date(cuts[i + 1]), reasons: reasons });
    }
    const out = win(w, w.text, w.goodBad, w.tip);
    if (parts.length) {
      out.relief = parts;
      out.tip += parts.map(function (p) { return "\nRelaxed " + hhmm(p.startTime) + "–" + hhmm(p.endTime) + " (crossed out): " + p.reasons.join("; "); }).join("");
    }
    return [out];
  }
  function hhmm(d) { return d.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: false, hour: "2-digit", minute: "2-digit" }); }
  // The parts of a window no relief covers (the whole window if it has none).
  function unrelieved(w) { return w.relief ? complement(iv(ms(w.startTime), ms(w.endTime)), w.relief) : [w]; }
  function complement(span, parts) { // parts of `span` not covered by `parts`
    let pieces = [span];
    parts.forEach(function (p) {
      const next = [];
      pieces.forEach(function (q) {
        const o = overlap(q, p);
        if (!o) { next.push(q); return; }
        if (ms(o.startTime) > ms(q.startTime)) next.push(iv(ms(q.startTime), ms(o.startTime)));
        if (ms(o.endTime) < ms(q.endTime)) next.push(iv(ms(o.endTime), ms(q.endTime)));
      });
      pieces = next;
    });
    return pieces;
  }

  // =========================================================================
  // Main view: small daily windows
  // =========================================================================
  function mainWindows(snapshot, data, opts) {
    const M = D(), ctx = ctxFor(snapshot, opts), P = dayParts(snapshot);
    const v = snapshot.varaIndex;
    const out = [];
    const dayLen = P.set - P.rise;

    // 1.37 Kulika, Kālavelā, Yamaghaṇṭa, Kaṇṭaka: one day muhūrta each.
    const dayMuh = snapshot.scaledRings.muhurta.day;
    const muhTip = {
      "Kulika": "Kulika muhūrta (1.37). Travel, marriage and upanayana are condemned in it. Harmless at night (Vasiṣṭha). Garga: Kulika harms in Kashmir, Ardhayāma everywhere.",
      "Kālavelā": "Kālavelā muhūrta (1.37). Avoid auspicious work. Harmless at night (Vasiṣṭha).",
      "Yamaghaṇṭa": "Yamaghaṇṭa muhūrta (1.37). Avoid auspicious work. Harmless at night (Vasiṣṭha). Garga: it harms only between the Vindhyas and the Himālaya.",
      "Kaṇṭaka": "Kaṇṭaka muhūrta (1.37). Avoid auspicious work. Harmless at night (Vasiṣṭha).",
    };
    Object.keys(M.namedMuhurta).forEach(function (name) {
      const m = dayMuh[M.namedMuhurta[name][v] - 1];
      if (m) out.push(win(m, name, "bad", muhTip[name]));
    });

    // 1.38-39 bad sixteenths of the day. The tooltip just says which one.
    M.badKalamsha[v].forEach(function (k) {
      const s = P.rise + (k - 1) * dayLen / 16;
      out.push(win(iv(s, s + dayLen / 16), "Kalāṃśa", "bad", "Kalāṃśa " + k + " of 16"));
    });

    // 1.32 ten palas either side of midday and midnight.
    const PALA10 = 4 * 60 * 1000;
    const noon = (P.rise + P.set) / 2, midnight = (P.set + P.next) / 2;
    out.push(win(iv(noon - PALA10, noon + PALA10), "Madhyāhna", "bad", "10 palas before and after midday: avoid in all auspicious work (1.32)."));
    out.push(win(iv(midnight - PALA10, midnight + PALA10), "Ardharātra", "bad", "10 palas before and after midnight: avoid in all auspicious work (1.32)."));

    bhadraWindows(snapshot, data, P).forEach(function (w) { out.push(w); });

    // 1.35 the first part of a bad nitya yoga.
    snapshot.yogaSequence.forEach(function (y) {
      const g = M.nityaPartial[y.index];
      if (g == null) return;
      const s = ms(y.startTime), e = ms(y.endTime);
      const end = g < 1 ? s + (e - s) * g : s + g * GH;
      out.push(win(iv(s, Math.min(end, e)), data.yoga.names[y.index], "bad",
        "The first " + (g < 1 ? "half" : g + " ghaṭīs") + " of " + data.yoga.names[y.index] + " yoga are to be avoided in all work; the rest of it is usable (1.35)."));
    });

    // 1.36 pakṣa-randhra tithis: their first ghaṭīs.
    snapshot.tithiSequence.forEach(function (t) {
      const g = M.pakshaRandhra[t.pakshaIndex];
      if (g == null || t.pakshaIndex === 15) return;
      const s = ms(t.startTime);
      out.push(win(iv(s, Math.min(s + g * GH, ms(t.endTime))), "Pakṣa-randhra", "bad",
        tithiLabel(data, t) + " is a pakṣa-randhra tithi: skip its first " + g + " ghaṭīs; the rest is good (1.36). Kāśyapa: skip 10 ghaṭīs."));
    });

    // 1.17-18 dagdha lagnas on odd tithis (Madhyadeśa only).
    const lagnas = snapshot.lagnaSequence.map(function (l) { return Object.assign(iv(ms(l.segStart), ms(l.segEnd)), { l: l }); });
    tithiSegs(snapshot).forEach(function (ts) {
      const list = M.dagdhaLagna[ts.t.pakshaIndex];
      if (!list) return;
      lagnas.forEach(function (ls) {
        if (list.indexOf(ls.l.index) === -1) return;
        const o = overlap(ts, ls);
        if (!o) return;
        if (!ctx.inRegion(["madhyadesha"])) { ctx.suppressed.push("Dagdha lagna"); return; }
        out.push(win(o, "Dagdha lagna", "bad", data.rashi.names[ls.l.index] + " lagna is dagdha on the " + ts.t.pakshaIndex + "th tithi (1.17). The text limits this to Madhyadeśa (1.18). Benefics in kendra or trikoṇa cancel it (1.19)."));
      });
    });

    // 1.16, 1.18-19 śūnya rāśi as lagna (Gauḍa and Mālava only).
    lagnas.forEach(function (ls) {
      const masa = masaAt(snapshot, (ms(ls.startTime) + ms(ls.endTime)) / 2);
      if (M.shunyaRashiByMasa[masa] !== ls.l.index) return;
      if (!ctx.inRegion(["gauda", "malava"])) { ctx.suppressed.push("Śūnya lagna"); return; }
      out.push(win(ls, "Śūnya lagna", "bad", data.rashi.names[ls.l.index] + " is the śūnya rāśi of " + data.amantaMasa.names[masa] + "; avoid it as the lagna (1.16). The text limits this to Gauḍa and Mālava (1.18–19)."));
    });

    // 2.53-54 abhukta-mūla; 2.57 gaṇḍānta (tithi, nakṣatra, lagna).
    const nakJunctions = [];
    snapshot.nakshatraSequence.forEach(function (n) {
      [[17, "Jyeṣṭhā–Mūla"], [8, "Āśleṣā–Maghā"], [26, "Revatī–Aśvinī"]].forEach(function (p) {
        if (n.index === p[0]) nakJunctions.push([ms(n.endTime), p[1], p[0]]);
        if (n.index === (p[0] + 1) % 27) nakJunctions.push([ms(n.startTime), p[1], p[0]]);
      });
    });
    const seen = {};
    nakJunctions.forEach(function (j) {
      const key = Math.round(j[0] / 60000);
      if (seen[key]) return;
      seen[key] = true;
      if (j[2] === 17 || j[2] === 8) {
        out.push(win(iv(j[0] - 4 * GH, j[0] + 4 * GH), "Abhukta-mūla", "bad",
          "Abhukta-mūla at the " + j[1] + " junction: Nārada's last 4 ghaṭīs of the one and first 4 of the next (2.53). Vasiṣṭha: 1 + 2; Bṛhaspati: ½ + ½; others: 5 + 8. A birth in it calls for śānti (2.54)."));
      }
      out.push(win(iv(j[0] - 2 * GH, j[0] + 2 * GH), "Gaṇḍānta", "bad",
        "Nakṣatra gaṇḍānta at the " + j[1] + " junction (2.57). Shown as 2 ghaṭīs either side, the commonly used span (the text here does not give one)."));
    });
    snapshot.tithiSequence.forEach(function (t) {
      if ([5, 10, 15].indexOf(t.pakshaIndex) === -1) return;
      const e = ms(t.endTime);
      out.push(win(iv(e - GH, e + GH), "Gaṇḍānta", "bad", "Tithi gaṇḍānta: end of a pūrṇā tithi joined to a nandā (2.57). Shown as 1 ghaṭī either side, the commonly used span."));
    });
    snapshot.lagnaSequence.forEach(function (l) {
      if ([3, 7, 11].indexOf(l.index) === -1 || ms(l.endTime) > P.next + GH) return;
      const e = ms(l.endTime);
      out.push(win(iv(e - GH / 2, e + GH / 2), "Gaṇḍānta", "bad", "Lagna gaṇḍānta: " + data.rashi.names[l.index] + "–" + data.rashi.names[(l.index + 1) % 12] + " (2.57). Shown as ½ ghaṭī either side, the commonly used span."));
    });

    // 1.35 mahāpāta (the Sun and Moon at equal declination).
    mahapata(snapshot).forEach(function (w) { out.push(w); });

    out.suppressed = uniq(ctx.suppressed);
    return out;
  }

  // 1.43-45 Bhadrā (Viṣṭi karaṇa), with its mouth (always bad), its tail
  // (good, in kṛṣṇa pakṣa), the day/night rule and its abode.
  function bhadraWindows(snapshot, data, P) {
    const M = D(), out = [];
    snapshot.karanaSequence.forEach(function (k) {
      if (k.key !== "movable:6") return;
      const s = ms(k.startTime), e = ms(k.endTime);
      const tithiNo = Math.ceil(k.number / 2), firstHalf = k.number % 2 === 1;
      const paksha = tithiNo <= 15 ? "s" : "k", pi = tithiNo <= 15 ? tithiNo : tithiNo - 15;
      const mt = M.bhadra[paksha + pi];
      const t = snapshot.tithiSequence.find(function (x) { return x.number === tithiNo; });
      if (!mt || !t) return;
      const ts = ms(t.startTime), L = ms(t.endTime) - ts;
      const mouth = iv(ts + (mt[0] - 1) * L / 8, ts + (mt[0] - 1) * L / 8 + 5 * L / 60);
      const tail = iv(ts + mt[1] * L / 8 - 3 * L / 60, ts + mt[1] * L / 8);
      const krishna = paksha === "k";
      const lon = VedicEngine.Sidereal.longitude("moon", new Date((s + e) / 2), snapshot.settings.ayanamsa, snapshot.settings.method);
      const abode = M.bhadraAbode[Math.floor(lon / 30)];
      const label = (krishna ? "Kṛṣṇa " : "Śukla ") + pi;
      const base = "Bhadrā (Viṣṭi karaṇa), " + (firstHalf ? "first" : "second") + " half of " + label + " (1.43). Suited to harsh work only (binding, poison, fire, weapons). " +
        (krishna ? "Kṛṣṇa Bhadrā is Sarpiṇī: avoid its mouth." : "Śukla Bhadrā is Vṛścikī: avoid its tail, so the tail is not shown as good.") +
        " Its abode now: " + abode + (abode === "bhūmi" ? " (its harm falls on earth)." : " (little harm on earth, 1.45).");
      const reliefs = [];
      // "Night Bhadrā by day, day Bhadrā by night" (1.44): a second-half Bhadrā
      // by day, or a first-half one by night, is harmless.
      reliefs.push({ span: firstHalf ? P.night : P.day, reason: (firstHalf ? "a first-half Bhadrā at night" : "a second-half Bhadrā by day") + " is harmless (1.44)" });
      if (abode !== "bhūmi") reliefs.push({ span: iv(s, e), reason: "Bhadrā in " + abode + ": urgent work may be done (1.45)" });
      const cutOut = [mouth].concat(krishna ? [tail] : []);
      complement(iv(s, e), cutOut).forEach(function (part) {
        relieve(win(part, "Bhadrā", "bad", base), reliefs).forEach(function (w) { out.push(w); });
      });
      const m = overlap(mouth, iv(s, e));
      if (m) out.push(win(m, "Bhadrā mukha", "bad", "Bhadrā's mouth: the first 5 ghaṭīs (of the tithi's 60) of its " + mt[0] + "th prahara. Bad for all work (1.44).\n" + base));
      const tl = overlap(tail, iv(s, e));
      if (tl && krishna) out.push(win(tl, "Bhadrā puccha", "good", "Bhadrā's tail: the last 3 ghaṭīs of its " + mt[1] + "th prahara. Good for all work (1.44)."));
    });
    return out;
  }

  // Mahāpāta (1.35): the Sun and Moon at equal declination on opposite
  // sides of a solstice point (Vyatīpāta: tropical longitudes summing to
  // 180°, same declination) or of an equinox (Vaidhṛti: summing to 360°,
  // opposite declinations). Shown while the two discs overlap in declination.
  function mahapata(snapshot) {
    const A = global.Astronomy;
    if (!A) return [];
    const P = dayParts(snapshot);
    const obs = new A.Observer(0, 0, 0);
    const STEP = 10 * 60 * 1000, out = [];
    let cur = null;
    for (let t = P.rise - 6 * 3600000; t <= P.next + 6 * 3600000; t += STEP) {
      const d = new Date(t);
      const sun = A.Equator(A.Body.Sun, d, obs, true, true), moon = A.Equator(A.Body.Moon, d, obs, true, true);
      const sum = (VedicEngine.Sidereal.tropicalSunLongitude(d) + VedicEngine.Sidereal.tropicalMoonLongitude(d)) % 360;
      let kind = null;
      if (Math.abs(sum - 180) < 20 && Math.abs(moon.dec - sun.dec) < 0.55) kind = "Vyatīpāta";
      else if ((sum < 20 || sum > 340) && Math.abs(moon.dec + sun.dec) < 0.55) kind = "Vaidhṛti";
      if (kind && cur && cur.kind === kind) cur.end = t + STEP;
      else if (kind) { cur = { kind: kind, start: t, end: t + STEP }; out.push(cur); }
      else cur = null;
    }
    return out.map(function (m) {
      return win(iv(m.start, m.end), "Mahāpāta", "bad", "Mahāpāta (astronomical " + m.kind + "): the Sun and Moon at equal declination. Avoid from its start to its end; some avoid the day before and after too (1.35).");
    });
  }

  // =========================================================================
  // Secondary view: tithi-vāra-nakṣatra yogas
  // =========================================================================
  // Kuyogas (1.31): made from tithi+vāra, tithi+nakṣatra, vāra+nakṣatra or
  // all three. Nārada (1.31) limits them to the Hūṇa, Vaṅga and Khaśa lands.
  const KUYOGA_REGIONS = ["huna", "vanga", "khasha"];

  function secondary(snapshot, data, opts) {
    const M = D(), ctx = ctxFor(snapshot, opts), P = dayParts(snapshot);
    const v = snapshot.varaIndex;
    const good = [], bad = [], out = [];
    const T = tithiSegs(snapshot), N = nakSegs(snapshot), N28 = nak28Segs(snapshot);
    const varaName = data.vara.names[v];

    // ---- good yogas ----
    T.forEach(function (ts) {
      const t = ts.t, c = classOf(t.pakshaIndex);
      if (M.siddhaClassByVara[v] === c) good.push(win(ts, "Siddha", "good", "Siddha yoga: " + M.tithiClass[c] + " tithi on " + varaName + " (1.4). It makes even a bad tithi good and, per Vasiṣṭha, removes faults like māsa-śūnya."));
      if (M.amritaClassByVara[v] === c) good.push(win(ts, "Amṛta", "good", "Amṛta yoga: " + M.tithiClass[c] + " tithi on " + varaName + " (1.5a, as both commentators read it; the plain reading is Mṛtyu yoga, bad)."));
    });
    N.forEach(function (ns) {
      const n = ns.n;
      if (M.sarvartha[v].indexOf(n.index) !== -1) {
        let tip = "Sarvārtha-siddhi: " + varaName + " with " + nakName(data, n.index) + "; success in every work (1.28–29).";
        M.siddhaCaution.forEach(function (c) { if (c[0] === v && c[1] === n.index) tip += "\nBut avoid it for " + c[2] + " unless the work is urgent (1.22)."; });
        good.push(win(ns, "Sarvārtha-siddhi", "good", tip));
      }
      const count = ((n.index - snapshot.sunNakshatraIndex + 27) % 27) + 1;
      if (M.raviYogaCounts.indexOf(count) !== -1) good.push(win(ns, "Ravi yoga", "good", "Ravi yoga: the Moon's nakṣatra is " + count + "th from the Sun's. It destroys every doṣa (1.27)."));
    });
    // Ānandādi (1.23-26): one for each nakṣatra span, counted with Abhijit.
    N28.forEach(function (s) {
      const count = ((s.idx28 - M.anandadiStart28[v] + 28) % 28) + 1;
      const nm = M.anandadiNames[count - 1];
      const isBad = M.anandadiBad.indexOf(count) !== -1;
      const tip = "Ānandādi yoga " + count + " of 28: " + nm + " (" + varaName + ", " + name28(data, s.idx28) + "). It gives the result its name suggests (1.23–25).";
      if (!isBad) { good.push(win(s, nm, "good", tip)); return; }
      bad.push({ w: win(s, nm, "bad", tip), kuyoga: true, partial: M.anandadiPartial[count], partialNote: count === 17 ? " (1.9 allows dropping only its first 12 ghaṭīs if the work is urgent.)" : "" });
    });
    // Tripuṣkara / Dvipuṣkara (2.50).
    if (M.pushkaraVaras.indexOf(v) !== -1) {
      T.forEach(function (ts) {
        if (classOf(ts.t.pakshaIndex) !== 1) return;
        N.forEach(function (ns) {
          const o = overlap(ts, ns);
          if (!o) return;
          if (M.tripushkaraNaks.indexOf(ns.n.index) !== -1) good.push(win(o, "Tripuṣkara", "good", "Tripuṣkara (2.50): bhadrā tithi, " + varaName + ", " + nakName(data, ns.n.index) + ". What happens now happens three times: good for gain (making ornaments, 2.19), bad for a loss or death (remedy: gift of 3 cows)."));
          if (M.dvipushkaraNaks.indexOf(ns.n.index) !== -1) good.push(win(o, "Dvipuṣkara", "good", "Dvipuṣkara (2.50): what happens now happens twice. Good for gain, bad for a loss or death (remedy: gift of 2 cows)."));
        });
      });
    }

    // ---- bad yogas ----
    T.forEach(function (ts) {
      const t = ts.t, pi = t.pakshaIndex;
      function k(text, tip, k141) { bad.push({ w: win(ts, text, "bad", tip), kuyoga: true, k141: k141 }); }
      if (M.krakachaTithiByVara[v] === pi) k("Krakaca", "Krakaca yoga: weekday number + tithi = 13 (1.6).", true);
      M.samvartaka.forEach(function (p) { if (p[0] === v && p[1] === pi) k("Saṃvartaka", "Saṃvartaka yoga (1.6).", false); });
      if (M.dagdhaTithiByVara[v] === pi) k("Dagdha", "Dagdha yoga: the " + pi + "th tithi on " + varaName + " (1.8).", true);
      if (M.vishaTithiByVara[v] === pi) k("Viṣa", "Viṣa yoga: the " + pi + "th tithi on " + varaName + " (1.8).", true);
      if (M.hutashanaTithiByVara[v] === pi) k("Hutāśana", "Hutāśana yoga: the " + pi + "th tithi on " + varaName + " (1.8).", true);
      const masa = t.amantaMasaRashiIndex;
      if (M.masaShunyaTithi[masa][t.paksha === "krishna" ? 0 : 1].indexOf(pi) !== -1) {
        if (ctx.inRegion(["madhyadesha"])) bad.push({ w: win(ts, "Māsa-śūnya", "bad", tithiLabel(data, t) + " is māsa-śūnya in " + data.amantaMasa.names[masa] + " (1.10): loss of family and wealth; śrāddha is allowed. The text limits this to Madhyadeśa (1.18)."), shunya: true });
        else ctx.suppressed.push("Māsa-śūnya tithi");
      }
      if (t.number === 30) bad.push({ w: win(ts, "Amāvāsyā", "bad", "Amāvāsyā: avoid auspicious work (1.35); rites for the ancestors only (1.3).") });
      M.manvadi.forEach(function (m) {
        if (m[0] === masa && m[1] === t.paksha[0] && m[2] === pi) bad.push({ w: win(ts, "Manvādi", "bad", "Manvādi tithi (1.57): bad for auspicious work, good for bathing, giving and śrāddha. Anadhyāya (no Veda study). Months are taken as amānta here.") });
      });
      M.yugadi.forEach(function (m) {
        if (m[0] === masa && m[1] === t.paksha[0] && m[2] === pi) bad.push({ w: win(ts, "Yugādi", "bad", m[3] + " yugādi (1.57): bad for auspicious work, good for bathing, giving and śrāddha. Months are taken as amānta here.") });
      });
      if (masa === 11 && t.paksha === "shukla" && pi >= 8) {
        if (ctx.inRegion(["panjab", "pushkara"])) bad.push({ w: win(ts, "Holāṣṭaka", "bad", "Holāṣṭaka (1.40): the 8 days before Phālguna Pūrṇimā. Avoid marriage and auspicious work, only by the Vipāśā, Irāvatī and Śatadru and at Tripuṣkara.") });
        else ctx.suppressed.push("Holāṣṭaka");
      }
    });
    // Tithi kṣaya / vṛddhi (1.35).
    const seq = snapshot.tithiSequence, dayMs = P.next - P.rise;
    if (seq.some(function (t) { return ms(t.startTime) > P.rise && ms(t.endTime) < P.next; })) {
      bad.push({ w: win(P.whole, "Tithi-kṣaya", "bad", "A tithi touches no sunrise today: three tithis in one weekday (1.35). Auspicious work 'turns to ash' (Vasiṣṭha). A benefic in a kendra removes the fault if the work is urgent.") });
    }
    if (seq.length && ms(seq[0].startTime) < P.rise - dayMs) {
      bad.push({ w: win(P.whole, "Tithi-vṛddhi", "bad", "Today's tithi touches three weekdays (1.35). A benefic in a kendra removes the fault if the work is urgent.") });
    }
    N.forEach(function (ns) {
      const n = ns.n;
      if (M.dagdhaNakByVara[v] === n.index) bad.push({ w: win(ns, "Dagdha nakṣatra", "bad", nakName(data, n.index) + " on " + varaName + " is dagdha: bad for marriage, travel and the like (1.5b)."), kuyoga: true });
      if (M.yamaghantaNakByVara[v] === n.index) bad.push({ w: win(ns, "Yamaghaṇṭa", "bad", "Yamaghaṇṭa: " + varaName + " with " + nakName(data, n.index) + " (1.9). Avoid in auspicious work, above all travel. Garga: no force if benefics are in kendra or trikoṇa from the lagna."), kuyoga: true, partial: 8 });
      const masa = masaAt(snapshot, (ms(ns.startTime) + ms(ns.endTime)) / 2);
      if (M.masaShunyaNak[masa].indexOf(n.index) !== -1) bad.push({ w: win(ns, "Māsa-śūnya", "bad", nakName(data, n.index) + " is a māsa-śūnya nakṣatra in " + data.amantaMasa.names[masa] + ": work done in it causes loss of wealth (1.14–15)."), shunya: true });
      // Pañcaka (2.48): the Moon in Kumbha or Mīna.
      if (n.index >= 22) {
        const s = n.index === 22 ? (ms(n.startTime) + ms(n.endTime)) / 2 : ms(n.startTime);
        const o = overlap(iv(s, ms(n.endTime)), ns);
        if (o) bad.push({ w: win(o, "Pañcaka", "bad", "Pañcaka (2.48): the Moon in Kumbha or Mīna. Do not cremate (or do the pañcaka-śānti), travel south, weave a cot, thatch a house or gather wood. Other work is not barred.") });
      }
    });
    // Bad tithi + nakṣatra (1.11-13) and Siddha turned bad on a tithi (1.20-21).
    T.forEach(function (ts) {
      N.forEach(function (ns) {
        const o = overlap(ts, ns);
        if (!o) return;
        const list = M.badTithiNak[ts.t.pakshaIndex];
        if (list && list.indexOf(ns.n.index) !== -1) bad.push({ w: win(o, "Tithi-nakṣatra doṣa", "bad", "The " + ts.t.pakshaIndex + "th tithi with " + nakName(data, ns.n.index) + " (1.11–13): whoever begins auspicious work in it dies within 6 months (Caturbhuja Miśra)."), kuyoga: true });
        const sb = M.siddhaBhanga[v];
        if (sb[0] === ns.n.index && sb[1] === ts.t.pakshaIndex) bad.push({ w: win(o, "Siddha-bhaṅga", "bad", varaName + " with " + nakName(data, ns.n.index) + " is normally a Siddha yoga, but on the " + sb[1] + "th tithi it turns bad; avoid it in all auspicious work (1.20–21). Daivajña-manohara calls it a Viṣa yoga."), kuyoga: true, breaks: o });
      });
    });
    // Vyatīpāta and Vaidhṛti (1.35), the whole nitya yoga.
    snapshot.yogaSequence.forEach(function (y) {
      if (M.nityaWhole.indexOf(y.index) === -1) return;
      bad.push({ w: win(iv(ms(y.segStart), ms(y.segEnd)), data.yoga.names[y.index], "bad", data.yoga.names[y.index] + " yoga: avoid in all work (1.35)."), afterNoon: true });
    });
    // Asal Vākya Amṛta / Maraṇa Yogam (Settings > Yogas), a local practice.
    if (ctx.opts.yogaSets && ctx.opts.yogaSets.asalVakya && data.nityaYoga) {
      N.forEach(function (ns) {
        const c = data.nityaYoga.table[ns.n.index][v];
        if (c === "A") good.push(win(ns, "Amṛta Yogam", "good", "Asal Vākya Pañcāṅga (Kumārasvāmīyam): Amṛta Yogam, " + varaName + " with " + nakName(data, ns.n.index) + ". A local practice, not from Muhūrta Cintāmaṇi."));
        if (c === "M") bad.push({ w: win(ns, "Maraṇa Yogam", "bad", "Asal Vākya Pañcāṅga (Kumārasvāmīyam): Maraṇa Yogam, " + varaName + " with " + nakName(data, ns.n.index) + ". A local practice, not from Muhūrta Cintāmaṇi.") });
      });
    }

    // ---- cancellations and relaxations ----
    // Siddha-bhaṅga removes the Sarvārtha-siddhi it overlaps.
    const breaks = bad.filter(function (b) { return b.breaks; }).map(function (b) { return b.breaks; });
    const goodOut = [];
    good.forEach(function (g) {
      if (g.text !== "Sarvārtha-siddhi" || !breaks.length) { goodOut.push(g); return; }
      complement(g, breaks).forEach(function (part) { goodOut.push(win(part, g.text, g.goodBad, g.tip)); });
    });
    // Good yogas strong enough to cancel a kuyoga (1.42, 1.27): Siddha,
    // Amṛta (1.5a), Sarvārtha-siddhi, Ravi yoga, and the Ānandādi Siddhi and
    // Amṛta. (The text names "Siddhi"; which good yogas count is our reading.)
    const CANCELLERS = ["Siddha", "Amṛta", "Sarvārtha-siddhi", "Ravi yoga", "Siddhi"];
    const cancel = goodOut.filter(function (g) { return CANCELLERS.indexOf(g.text) !== -1; }).map(function (g) {
      return { span: g, reason: g.text + " cancels it (" + (g.text === "Ravi yoga" ? "1.27" : "1.42") + ")" };
    });
    const siddhaSpans = goodOut.filter(function (g) { return g.text === "Siddha"; });
    const suppressedKu = [];
    bad.forEach(function (b) {
      if (b.kuyoga && !ctx.inRegion(KUYOGA_REGIONS)) { suppressedKu.push(b.w.text); return; }
      const reliefs = [];
      let w = b.w;
      if (b.kuyoga) {
        if (b.partial != null) {
          // Only the first N ghaṭīs are bad if the work is urgent (1.9, 1.26).
          const s = ms(w.startTime);
          reliefs.push({ span: iv(s + b.partial * GH, ms(w.endTime) + 1), reason: "only its first " + b.partial + " ghaṭīs need be avoided if the work is urgent (" + (w.text === "Yamaghaṇṭa" ? "1.9" : "1.26") + ")" + (b.partialNote || "") });
        }
        if (b.k141) reliefs.push({ span: iv(ms(P.firstYama.endTime), P.next + 1), reason: "some hold it only in the first yāma of the day; Lalla, only for travel; a strong Moon removes it (1.41)" });
        reliefs.push({ span: P.night, reason: "bad yogas harm by day, not at night (Vasiṣṭha, 1.9)" });
        cancel.forEach(function (c) { reliefs.push(c); });
      }
      if (b.shunya) siddhaSpans.forEach(function (s) { reliefs.push({ span: s, reason: "a Siddha tithi removes māsa-śūnya faults (Vasiṣṭha, 1.4)" }); });
      if (b.afterNoon) reliefs.push({ span: P.afterNoon, reason: "if unavoidable, the time after midday is good (1.42)" });
      relieve(w, reliefs).forEach(function (x) { out.push(x); });
    });
    suppressedKu.forEach(function (s) { ctx.suppressed.push(s); });
    goodOut.forEach(function (g) { out.push(g); });
    return { windows: out, suppressed: uniq(ctx.suppressed), region: ctx.region };
  }
  function uniq(a) { return a.filter(function (x, i) { return a.indexOf(x) === i; }); }

  // =========================================================================
  // Today Details: details for the day
  // =========================================================================
  function todaySpecial(snapshot, data, opts) {
    const M = D(), ctx = ctxFor(snapshot, opts), P = dayParts(snapshot);
    const v = snapshot.varaIndex, s = snapshot.settings;
    const sections = [];
    const fmt = function (d) { return d.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: false, hour: "2-digit", minute: "2-digit" }) + VedicEngine.RingAdapter.dateNote(d, snapshot.anchors); };
    const range = function (a, b) { return fmt(a) + "–" + fmt(b); };

    // ---- Tithi ----
    snapshot.tithiSequence.forEach(function (t) {
      const items = [];
      const pi = t.pakshaIndex, c = classOf(pi), key = t.number === 30 ? 30 : pi;
      items.push("Lord: " + (t.number === 30 ? M.amavasyaLord : M.tithiLord[pi - 1]) + ". Worship or install a deity on its own tithi (1.3).");
      items.push(M.tithiClass[c] + " tithi: " + M.tithiClassResult[c] + " (1.4).");
      const third = pi <= 5 ? 0 : pi <= 10 ? 1 : 2;
      const strength = t.paksha === "shukla" ? ["inauspicious (Moon weak)", "middling", "best"][third] : ["best", "middling", "inauspicious"][third];
      items.push("Pakṣa strength: " + strength + " (1.4).");
      const w = Object.assign({}, M.tithiWork[key]);
      if (key === 1 && t.paksha === "krishna") delete w.avoid;
      if (w.do) items.push("Suited to: " + w.do + " (1.3).");
      if (w.avoid) items.push("Avoid: " + w.avoid + " (1.3).");
      const pkey = t.number === 30 ? 30 : t.number === 15 ? 45 : pi;
      M.tithiProhibit.forEach(function (p) { if (p.tithis.indexOf(pkey) !== -1) items.push(p.text); });
      if ((t.paksha === "krishna" && (pi === 8 || pi === 14)) || pi === 15) items.push("A parva day (1.7 commentary).");
      items.push("For bathing, oil, tooth-cleaning, union, birth and death use the tithi at that moment, not the one at sunrise (1.7).");
      sections.push({ title: "Tithi: " + tithiLabel(data, t), sub: range(t.segStart, t.segEnd), items: items });
    });

    // ---- Nakṣatra ----
    snapshot.nakshatraSequence.forEach(function (n) {
      const i = n.index, items = [];
      items.push("Lord: " + M.nakLord[i] + " (2.1). Shape: " + M.shape[i] + "; stars: " + M.stars[i] + " (2.58–60).");
      Object.keys(M.NAK_CLASS).forEach(function (k) {
        const c = M.NAK_CLASS[k];
        if (c.naks.indexOf(i) !== -1) items.push(c.name + ": " + c.use + " (2.2–8)." + (c.vara === v ? " Today's weekday is of the same nature." : ""));
      });
      Object.keys(M.facing).forEach(function (f) { if (M.facing[f].indexOf(i) !== -1) items.push("Faces " + f + " (2.9): " + M.facingUse[f] + "."); });
      M.eye.forEach(function (e) { if (e.naks.indexOf(i) !== -1) items.push(e.name + " (2.22–23): " + e.result + "."); });
      M.illness.forEach(function (x) { if (x.naks.indexOf(i) !== -1) items.push("An illness that begins now: " + x.text + " (2.45–46)."); });
      if (M.snakeFatal.indexOf(i) !== -1) items.push("A snakebite now is held fatal (2.46).");
      if (M.pretaKriya.indexOf(i) !== -1) items.push("Preta-kriya may be done (2.48).");
      M.deityNak.forEach(function (d) { if (d.naks.indexOf(i) !== -1) items.push("Pratiṣṭhā of " + d.text + " (2.63)."); });
      if (i === 18) items.push("Mūla's abode this month: " + M.mulaAbodeByMasa[masaAt(snapshot, ms(n.segStart))] + (M.mulaAbodeByMasa[masaAt(snapshot, ms(n.segStart))] === "bhūmi" ? " (a Mūla birth's result applies, 2.56)." : " (little harm on earth, 2.56)."));
      if (i === 18 || i === 8) items.push("Birth in " + data.nakshatra.names[i] + " by pada: " + (i === 18 ? "1 father, 2 mother, 3 wealth, 4 good" : "4 father, 3 mother, 2 wealth, 1 good") + "; śānti removes it (2.55).");
      if (i === 17) items.push("Jyeṣṭhā birth: śānti by the 10 parts of 6 ghaṭīs (2.57).");
      if (n.index >= 22) items.push("Pañcaka from the middle of Dhaniṣṭhā to the end of Revatī (2.48): no cremation without śānti, no travel south, no cot-weaving, thatching or gathering wood.");
      sections.push({ title: "Nakṣatra: " + data.nakshatra.names[i], sub: range(n.segStart, n.segEnd), items: items });
    });

    // ---- Good today for ----
    const actItems = [];
    const nakNow = snapshot.nakshatraSequence;
    M.activities.forEach(function (a) {
      const spans = [];
      nakNow.forEach(function (n) {
        if (a.naks.indexOf(n.index) === -1) return;
        if (a.badVara && a.badVara.indexOf(v) !== -1) return;
        if (a.okVara && a.okVara.indexOf(v) === -1) return;
        snapshot.tithiSequence.forEach(function (t) {
          const o = overlap(iv(ms(n.segStart), ms(n.segEnd)), iv(ms(t.segStart), ms(t.segEnd)));
          if (!o) return;
          const c = classOf(t.pakshaIndex);
          if (a.badClass && a.badClass.indexOf(c) !== -1) return;
          if (a.badTithi && a.badTithi.indexOf(t.pakshaIndex) !== -1) return;
          if (a.okTithi && a.okTithi.indexOf(t.pakshaIndex) === -1) return;
          if (a.badMasa && a.badMasa.indexOf(t.amantaMasaRashiIndex) !== -1) return;
          spans.push(o);
        });
      });
      if (!spans.length) return;
      spans.sort(function (x, y) { return ms(x.startTime) - ms(y.startTime); });
      const merged = [];
      spans.forEach(function (x) {
        const last = merged[merged.length - 1];
        if (last && ms(x.startTime) - ms(last.endTime) <= 60000) last.endTime = new Date(Math.max(ms(last.endTime), ms(x.endTime)));
        else merged.push(iv(ms(x.startTime), ms(x.endTime)));
      });
      actItems.push(a.name + " (" + a.v + "): " + merged.map(function (x) { return range(x.startTime, x.endTime); }).join(", ") + (a.need ? ". Also needs: " + a.need + "." : ""));
    });
    if (v === 2 || snapshot.yogaSequence.some(function (y) { return y.index === 10; }) || (v === 0 && nakNow.some(function (n) { return n.index === 12; }))) {
      actItems.push("Do not borrow money today (Tuesday, Vṛddhi yoga, Saṅkrānti or Sunday + Hasta): the debt passes to sons and grandsons (2.27).");
    }
    if (v === 2) actItems.push("Repaying a debt is good on a Tuesday (2.27).");
    M.siddhaCaution.forEach(function (c) { if (c[0] === v && nakNow.some(function (n) { return n.index === c[1]; })) actItems.push("Avoid " + c[2] + " today despite the good yoga (1.22)."); });
    sections.push({ title: "Activities by nakṣatra, weekday and tithi", sub: "Prakaraṇa 2. Lagna conditions are not checked.", items: actItems.length ? actItems : ["No listed activity suits today's nakṣatra, weekday and tithi together."] });

    // ---- The day ----
    const dayItems = [];
    dayItems.push("Dishāśūla: do not travel " + M.dishashula[v] + " today (1.37 commentary).");
    try {
      const lanka = { latitude: 0, longitude: 75.77, elevation: 0 };
      const lr = VedicEngine.Sunrise.sunriseAtOrBefore(lanka, new Date(P.rise + 4 * 3600000), "disc-centre");
      if (lr) {
        const diff = Math.round((ms(lr) - P.rise) / 60000);
        dayItems.push("Vāra-pravṛtti: " + data.vara.names[v] + " begins at " + fmt(lr) + ", sunrise on the Laṅkā meridian, " + Math.abs(diff) + " min " + (diff < 0 ? "before" : "after") + " local sunrise (1.54). The Horā ring counts from local sunrise; the text counts kāla-horā from here (1.55).");
      }
    } catch (e) { /* skip */ }
    const sunN = snapshot.sunNakshatraIndex, moonN = snapshot.nakshatra.index;
    const sun28 = sunN < 21 ? sunN : sunN + 1, moon28 = moonN < 21 ? moonN : moonN + 1;
    const c27 = ((moonN - sunN + 27) % 27) + 1, c28 = ((moon28 - sun28 + 28) % 28) + 1;
    const g = Math.floor((c27 - 1) / 3);
    dayItems.push("Homa: the first oblation falls in the mouth of " + M.homaMouth[g] + (M.homaMouthBad.indexOf(g) !== -1 ? " — a malefic; bad for homa (remedy: gift of a cow and śānti)" : " — good") + " (2.35).");
    const tNo = snapshot.tithi.number;
    const agni = ((tNo + 1) + (v + 1)) % 4;
    dayItems.push("Agni-vāsa: " + (agni === 0 || agni === 3 ? "on earth — good for homa" : agni === 1 ? "in heaven — loss of life" : "in the nether world — loss of wealth") + ". Not needed for saṃskāras, nitya and naimittika homas or vivāha (2.36).");
    const wd = M.woodDung.find(function (x) { return c28 <= x[0]; });
    if (wd) dayItems.push("Gathering wood and cow-dung: " + wd[1] + (wd[2] ? "" : " — avoid") + " (2.49).");
    const hc = M.halaChakra.find(function (x) { return c28 <= x[0]; });
    if (hc) dayItems.push("Hala-cakra for ploughing: " + (hc[1] ? "good" : "bad") + " (2.29).");
    const rahu = rahuNakshatra(new Date(P.rise), s);
    const pc = M.phaniChakra.find(function (x) { return (((moonN - rahu + 27) % 27) + 1) <= x[0]; });
    if (pc) dayItems.push("Phaṇi-cakra for sowing (from Rāhu in " + data.nakshatra.names[rahu] + "): " + (pc[1] ? "good" : "bad") + " (2.29).");
    sections.push({ title: "The day", sub: data.vara.names[v], items: dayItems });

    // ---- Planets, months and eclipses ----
    sections.push({ title: "Planets, months and eclipses", sub: "Prakaraṇa 1, verses 32–33 and 46–53", items: planetaryItems(snapshot, data, ctx, P) });

    // ---- Regional rules ----
    const sec = secondary(snapshot, data, opts), mainSup = mainWindows(snapshot, data, opts).suppressed;
    const regItems = [];
    const reg = ctx.region;
    regItems.push(reg.district ? "Nearest district: " + reg.district + ", " + reg.state + "." : "Outside India: no region the text names applies.");
    regItems.push("Regions of the text that include it (estimated): " + (reg.keys.length ? reg.keys.map(function (k) { return M.regions[k].name; }).join(", ") : "none") + ".");
    if (opts && opts.regionalLimits === false) regItems.push("Regional limits are off (Settings > Yogas): every rule is shown everywhere.");
    else {
      const sup = uniq(sec.suppressed.concat(mainSup));
      regItems.push(sup.length ? "Held today but not shown here, as the text limits them to other regions: " + sup.join(", ") + ". Kuyogas of tithi, vāra and nakṣatra are limited to the Hūṇa, Vaṅga and Khaśa lands (1.31)." : "No regionally limited rule was hidden today.");
    }
    sections.push({ title: "Your region", sub: "", items: regItems });

    sections.push({ title: "Not computed", sub: "", items: [
      "Rules that need birth details: janma nakṣatra, māsa and tithi for the first-born (1.34); nāḍī nakṣatras (2.43, 2.61); tārā and the Moon from the janma rāśi.",
      "Portents, earthquakes and planetary war (1.32), and a nakṣatra pierced by a planet.",
      "Lagna strength and placements the activities ask for (benefics in kendra, a clean 8th house, and so on).",
    ] });
    return sections;
  }
  // Mean Rāhu (ascending node), sidereal nakṣatra index.
  function rahuNakshatra(date, settings) {
    const T = (date.getTime() / 86400000 + 2440587.5 - 2451545.0) / 36525;
    const trop = ((125.04452 - 1934.136261 * T) % 360 + 360) % 360;
    const ay = VedicEngine.Ayanamsa.get(settings.ayanamsa, date);
    const sid = ((trop - ay) % 360 + 360) % 360;
    return Math.floor(sid / (360 / 27));
  }

  // ---- Planets (1.46-53), months (1.35, 1.48), eclipses (1.32-33) ----------
  function planetaryItems(snapshot, data, ctx, P) {
    const A = global.Astronomy, M = D(), items = [];
    if (!A) return ["Planetary checks need the ephemeris."];
    const s = snapshot.settings, date = new Date((P.rise + P.set) / 2);
    const DAY = 86400000;
    function sidLon(body, d) {
      const ecl = A.Ecliptic(A.GeoVector(body, d, true));
      return ((ecl.elon - VedicEngine.Ayanamsa.get(s.ayanamsa, d)) % 360 + 360) % 360;
    }
    function setNow(body, d) {
      const ang = A.AngleFromSun(body, d);
      if (body === A.Body.Venus) {
        const retro = sidLon(body, new Date(ms(d) + DAY)) < sidLon(body, d) && Math.abs(sidLon(body, new Date(ms(d) + DAY)) - sidLon(body, d)) < 5;
        return ang < (retro ? 8 : 10);
      }
      return ang < 11;
    }
    const BARRED = "Barred meanwhile: wells, tanks, gardens and houses, gṛha-praveśa, vratas, mahādānas, sacrifices, upanayana, marriage, caula, pratiṣṭhā, dīkṣā, sannyāsa, travel, ear-boring and similar. Rites with a fixed time (sīmanta, jātakarma, nāmakaraṇa, annaprāśana) go ahead (1.46–47).";
    [["Jupiter (Guru)", A.Body.Jupiter], ["Venus (Śukra)", A.Body.Venus]].forEach(function (p) {
      const now = setNow(p[1], date);
      const before = setNow(p[1], new Date(ms(date) - 15 * DAY)), after = setNow(p[1], new Date(ms(date) + 15 * DAY));
      if (now) items.push(p[0] + " is set (combust). " + BARRED);
      else if (before) items.push(p[0] + " rose within the last 15 days: 'young' (bālya; Nārada's 15 days, others 10 or 7). " + BARRED);
      else if (after) items.push(p[0] + " sets within 15 days: 'old' (vṛddha; Nārada's 15 days, others 10 or 7). " + BARRED);
      else items.push(p[0] + " is visible: no asta-doṣa.");
    });
    const jl = sidLon(A.Body.Jupiter, date), jSign = Math.floor(jl / 30), sunL = VedicEngine.Sidereal.longitude("sun", date, s.ayanamsa, s.method), sunSign = Math.floor(sunL / 30);
    const vl = sidLon(A.Body.Venus, date), vSign = Math.floor(vl / 30);
    const jRetro = ((sidLon(A.Body.Jupiter, new Date(ms(date) + DAY)) - jl + 540) % 360) - 180 < 0;
    items.push("Jupiter in " + data.rashi.names[jSign] + " (" + (jl % 30).toFixed(1) + "°)" + (jRetro ? ", retrograde (some bar the same rites, 1.47)" : "") + ".");
    if (jSign === 4) {
      const deg = jl - 120;
      if (deg < 40 / 3) items.push("Siṃhastha Guru in Maghā: barred in every country (1.50–51)." + (sunSign === 0 ? " The Sun is in Meṣa, so upanayana and marriage are allowed (1.49)." : ""));
      else if (ctx.inRegion(["gangaGodavari", "kalinga", "gauda", "gurjara"])) items.push("Siṃhastha Guru: barred here (between the Gaṅgā and Godāvarī; in Kaliṅga, Gauḍa and Gurjara all of Siṃha) (1.49–51)." + (sunSign === 0 ? " The Sun is in Meṣa, so it is allowed (1.49)." : "") + (deg >= 40 / 3 && deg < 50 / 3 ? " Marriage is barred only in this Siṃha navāṃśa (1.49)." : ""));
      else items.push("Siṃhastha Guru past Maghā: the text bars it only between the Gaṅgā and Godāvarī and in Kaliṅga, Gauḍa and Gurjara, not here (1.50–51).");
    }
    if (jSign === 9) {
      if (ctx.inRegion(["konkana", "magadha", "gauda", "sindhu"])) items.push("Jupiter in Makara (debilitated): barred here, in Koṅkaṇa, Magadha, Gauḍa and Sindhu (1.52). Vyavahāra-Caṇḍeśvara bars only its 5° of deep debilitation" + (Math.abs((jl % 30) - 5) < 1 ? ", which it is in now." : "."));
      else items.push("Jupiter in Makara: the text bars it only in Koṅkaṇa, Magadha, Gauḍa and Sindhu, not here (1.52).");
    }
    if (jSign === sunSign) items.push("Gurvāditya: the Sun and Jupiter in one sign; the asta rites are barred (1.48).");
    if ((jSign - vSign + 12) % 12 === 6) {
      if (ctx.inRegion(["northNarmada"])) items.push("Samasaptaka: Jupiter and Venus in mutual 7th. Avoid marriage this month north of the Narmadā (1.53).");
      else items.push("Samasaptaka (Jupiter and Venus in mutual 7th) holds, but the text limits it to north of the Narmadā (1.53).");
    }
    // Lupta saṃvatsara (1.53): Jupiter races (atichāra) through a sign in
    // under ~10 months, counting from its first entry to its last exit
    // (retrograde returns included), having left a sign other than Meṣa,
    // Vṛṣabha, Kumbha or Mīna.
    try {
      const signAt = function (d) { return Math.floor(sidLon(A.Body.Jupiter, d) / 30); };
      let first = null, last = null;
      for (let k = -80; k <= 80; k++) {
        const t = ms(date) + k * 5 * DAY;
        if (signAt(new Date(t)) === jSign) { if (first === null) first = t; last = t; }
      }
      const months = (last - first) / (30.4 * DAY);
      const fromSign = (jSign + 11) % 12;
      if (first > ms(date) - 395 * DAY && last < ms(date) + 395 * DAY && months < 10 && [0, 1, 10, 11].indexOf(fromSign) === -1) {
        if (ctx.inRegion(["revaGanga"])) items.push("Lupta saṃvatsara: Jupiter spends only about " + months.toFixed(1) + " months in " + data.rashi.names[jSign] + " (atichāra). Highly condemned for auspicious work between the Revā and Gaṅgā (1.53).");
        else items.push("Jupiter spends only about " + months.toFixed(1) + " months in " + data.rashi.names[jSign] + " (atichāra), but the lupta-saṃvatsara fault holds only between the Revā and Gaṅgā (1.53).");
      }
    } catch (e) { /* skip */ }
    // Adhika / kṣaya māsa (1.35, 1.46).
    try {
      let prevNew = A.SearchMoonPhase(0, new Date(ms(date) - 31 * DAY), 31).date;
      const later = A.SearchMoonPhase(0, new Date(ms(prevNew) + DAY), 31).date;
      if (ms(later) <= ms(date)) prevNew = later;
      const nextNew = A.SearchMoonPhase(0, new Date(ms(date) + 60000), 31).date;
      const s1 = Math.floor(VedicEngine.Sidereal.longitude("sun", prevNew, s.ayanamsa, s.method) / 30);
      const s2 = Math.floor(VedicEngine.Sidereal.longitude("sun", nextNew, s.ayanamsa, s.method) / 30);
      const changes = (s2 - s1 + 12) % 12;
      if (changes === 0) items.push("Adhika māsa: no saṅkrānti this lunar month. All non-routine work is barred (1.35, 1.46).");
      if (changes === 2) items.push("Kṣaya māsa: two saṅkrāntis this lunar month. All non-routine work is barred; the months either side count as adhika (1.46).");
      // Viśvaghasra (1.48): a pakṣa of only 13 sunrises.
      const full = A.SearchMoonPhase(180, prevNew, 31).date;
      const half = ms(date) < ms(full) ? [prevNew, full] : [full, nextNew];
      let count = 0, t = VedicEngine.Sunrise.sunriseAfter(s.location, half[0], s.sunriseEdge);
      while (t && ms(t) < ms(half[1]) && count < 20) { count++; t = VedicEngine.Sunrise.sunriseAfter(s.location, new Date(ms(t) + 3600000), s.sunriseEdge); }
      if (count <= 13) items.push("Viśvaghasra pakṣa: only " + count + " days in this pakṣa. Do not make or wear ivory or jewelled ornaments; asta rites barred (1.48).");
    } catch (e) { /* skip */ }
    // Eclipses (1.32-33).
    try {
      const obs = new A.Observer(s.location.latitude, s.location.longitude, s.location.elevation || 0);
      const from = new Date(ms(date) - 190 * DAY), until = ms(date) + 4 * DAY;
      const ecl = [];
      let le = A.SearchLunarEclipse(from);
      for (let k = 0; k < 6 && ms(le.peak.date) < until; k++) {
        if (le.kind !== "penumbral") {
          // Visible if the Moon is up at any point of the partial phase.
          const visible = [-1, -0.5, 0, 0.5, 1].some(function (f) {
            const d = new Date(ms(le.peak.date) + f * le.sd_partial * 60000);
            const eq = A.Equator(A.Body.Moon, d, obs, true, true);
            return A.Horizon(d, obs, eq.ra, eq.dec).altitude > 0;
          });
          if (visible) ecl.push({ what: "lunar", time: le.peak.date, frac: le.kind === "total" ? 1 : le.obscuration, nak: Math.floor(VedicEngine.Sidereal.longitude("moon", le.peak.date, s.ayanamsa, s.method) / (360 / 27)) });
        }
        le = A.NextLunarEclipse(le.peak);
      }
      let se = A.SearchLocalSolarEclipse(from, obs);
      for (let k = 0; k < 6 && ms(se.peak.time.date) < until; k++) {
        if (se.peak.altitude > 0) ecl.push({ what: "solar", time: se.peak.time.date, frac: se.kind === "total" ? 1 : se.obscuration, nak: Math.floor(VedicEngine.Sidereal.longitude("sun", se.peak.time.date, s.ayanamsa, s.method) / (360 / 27)) });
        se = A.NextLocalSolarEclipse(se.peak.time, obs);
      }
      const todayNaks = snapshot.nakshatraSequence.map(function (n) { return n.index; });
      ecl.forEach(function (e) {
        const days = (ms(e.time) - ms(date)) / DAY;
        const when = e.time.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });
        if (Math.abs(days) <= 3.5) items.push("A " + e.what + " eclipse on " + when + ": avoid auspicious work for 3 days before and after (1.32). Japa and homa are not affected.");
        const monthsBar = e.frac >= 0.99 ? 6 : e.frac >= 0.5 ? 3 : 1;
        if (days < 0 && -days <= monthsBar * 30.4 && todayNaks.indexOf(e.nak) !== -1) {
          items.push(data.nakshatra.names[e.nak] + " was the nakṣatra of the " + e.what + " eclipse on " + when + ": avoid it for auspicious work for " + monthsBar + " month" + (monthsBar > 1 ? "s" : "") + " after (1.33).");
        }
      });
    } catch (e) { /* skip */ }
    return items;
  }

  VedicEngine.MCYogas = { regionsFor: regionsFor, mainWindows: mainWindows, unrelieved: unrelieved, secondary: secondary, todaySpecial: todaySpecial };
})(typeof window !== "undefined" ? window : globalThis);
