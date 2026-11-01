// Translates one Panchanga snapshot + the active ring selection into a plain
// list of drawable segments (start/end angle on the fixed ghati scale, label,
// contested flag). dial.js only ever consumes this output - it never touches
// VedicEngine or panchanga-data.json directly, keeping "engine" (panchanga.js),
// "presentation logic" (this file) and "SVG drawing" (dial.js) as three
// separate, individually testable layers.
(function (global) {
  "use strict";

  const VedicEngine = global.VedicEngine = global.VedicEngine || {};
  const Ghati = VedicEngine.Ghati;

  // The Switch display cycle: one ring at a time in the switchable layer.
  // Tithi and nakshatra joined the cycle (they used to have their own
  // always-on rings) when the good/bad times moved OUT of it into their own
  // two always-on rings (buildGoodBadTimes below), per the project owner.
  // Yoga (the 27-fold Vishkambha..Vaidhriti cycle), Karana and Lagna
  // complete the five limbs alongside vara, tithi and nakshatra.
  const RING_ORDER = ["tithi", "nakshatra", "muhurta", "prahara", "kala", "hora", "yoga", "karana", "lagna"];

  // Rings whose divisions follow the sky rather than the day (they start
  // and end at a different time every day): dial.js labels each of these
  // at the START of its division, right after the boundary, rather than in
  // the middle, so a reader sees where the new one begins.
  const START_LABEL_RINGS = { tithi: true, nakshatra: true, yoga: true, karana: true, lagna: true };

  // Static display titles, for UI (e.g. the settings ring-order list) that
  // needs a label without computing a full snapshot. Kept in sync with the
  // `title` values set in build() below.
  const RING_TITLES = {
    // Display names follow IAST, per the project owner.
    muhurta: "Muhūrta", prahara: "Yāma", kala: "Kāla", hora: "Horā",
    yoga: "Yoga", karana: "Karaṇa", lagna: "Lagna",
    tithi: "Tithi", nakshatra: "Nakṣatra",
  };

  // `anchors` is snapshot.anchors ({governingSunrise, sunsetToday, nextSunrise,
  // previousSunset}) - Ghati.angleForTime needs the whole thing now that the
  // ghati scale is day/night-rescaled rather than a single fixed rate.
  const PAKSHA_LABEL = { shukla: "śukla", krishna: "kṛṣṇa" }; // engine key -> IAST

  // Marker lines (buildDayMarkers), by key, for the dial and Settings.
  const MARKER_TITLES = {
    avartana: "Āvartana", nishitha: "Niśītha", arunodaya: "Aruṇodaya",
    moonrise: "Candrodaya", moonset: "Candrāsta", sankranti: "Saṅkrānti",
  };
  // The rings that are always on (not part of the Switch display cycle);
  // each can still be hidden in Settings.
  const FIXED_RING_TITLES = { goodBad: "Good / Bad Times", dayNight: "Day / Night" };

  function angleOf(date, anchors) {
    return Ghati.angleForTime(date, anchors);
  }

  // "15:21" (GG:PP) - compact ghati:pala for every ring segment's tooltip,
  // shown on its own line above the plain HH:MM range dial.js adds.
  function ghatiPalaLabel(date, anchors) {
    const g = Ghati.current(date, anchors);
    return String(g.ghati).padStart(2, "0") + ":" + String(g.pala).padStart(2, "0");
  }

  // Fills in startAngle/endAngle for any segment that doesn't already have
  // them (the "single value"/merged builders below set startTime/endTime
  // but leave angles null until anchors are available), and ALWAYS attaches
  // startGhatiPala/endGhatiPala - every ring's tooltip reads these directly
  // rather than each recomputing them. Called once at the end of every
  // top-level builder (build()'s switch, buildDayNight, buildGoodBadTimes).
  function finalizeSegments(segments, anchors) {
    segments.forEach(function (seg) {
      if (seg.startAngle == null) {
        seg.startAngle = angleOf(seg.startTime, anchors);
        seg.endAngle = angleOf(seg.endTime, anchors);
      }
      seg.startGhatiPala = ghatiPalaLabel(seg.startTime, anchors);
      seg.endGhatiPala = ghatiPalaLabel(seg.endTime, anchors);
    });
    return segments;
  }

  function segmentFromInterval(interval, anchors, text, contested) {
    return {
      startAngle: angleOf(interval.startTime, anchors),
      endAngle: angleOf(interval.endTime, anchors),
      startTime: interval.startTime,
      endTime: interval.endTime,
      text: text,
      contested: !!contested,
    };
  }

  function namedOrPlaceholder(names, i, prefix) {
    if (names && names[i] != null) return names[i];
    return prefix + " " + (i + 1);
  }

  function buildSimpleDivided(dayList, nightList, anchors, dayDef, nightDef) {
    const segments = [];
    dayList.forEach(function (iv, i) {
      segments.push(segmentFromInterval(iv, anchors, namedOrPlaceholder(dayDef.names, i, dayDef.placeholderPrefix), dayDef.names == null));
    });
    nightList.forEach(function (iv, i) {
      segments.push(segmentFromInterval(iv, anchors, namedOrPlaceholder(nightDef.names, i, nightDef.placeholderPrefix), nightDef.names == null));
    });
    return segments;
  }

  // One combined band for a whole span (used where a ring has no per-segment
  // breakdown for night, e.g. kala).
  function combinedBand(list, anchors, text, contested) {
    if (!list.length) return null;
    const combined = { startTime: list[0].startTime, endTime: list[list.length - 1].endTime };
    return segmentFromInterval(combined, anchors, text, contested);
  }

  function buildKala(snapshot, data) {
    const anchors = snapshot.anchors;
    const r = snapshot.scaledRings.kala;
    const segments = r.day.map(function (iv, i) {
      return segmentFromInterval(iv, anchors, data.kala.day.names[i], false);
    });
    // Kala isn't defined at night: a plain blank (neutral) band, no label.
    const night = combinedBand(r.night, anchors, "", false);
    if (night) segments.push(night);
    return segments;
  }

  // The daily good/bad time windows: Rāhu Kālam, Yamagaṇḍa, Gulika Kālam,
  // Durmuhūrta and Varjyam (bad), and Abhijit, Pradoṣa, Godhūli and Amṛta
  // Kālam (good), as raw (possibly overlapping, possibly outside the day)
  // intervals - buildGoodBadTimes below clips and lays them out.
  function dailyWindows(snapshot, data) {
    const r = snapshot.scaledRings.rahuYamaGulika;
    const muhurta = snapshot.scaledRings.muhurta;
    const idx = data.rahuYamaGulika.weekdaySegmentIndex;
    const v = snapshot.varaIndex;
    function windowOf(iv, text, goodBad) {
      return { startTime: iv.startTime, endTime: iv.endTime, text: text, goodBad: goodBad };
    }
    const intervals = [
      windowOf(r.day[idx.rahu[v]], "Rāhu Kālam", "bad"),
      windowOf(r.day[idx.yamaganda[v]], "Yamagaṇḍa", "bad"),
      windowOf(r.day[idx.gulika[v]], "Gulika Kālam", "bad"),
    ];
    data.durmuhurta.byWeekday[v].forEach(function (d) {
      intervals.push(windowOf(muhurta[d.part][d.index], "Durmuhūrta", "bad"));
    });
    if (data.abhijit.skipWeekdays.indexOf(v) === -1) {
      intervals.push(windowOf(muhurta.day[data.abhijit.dayIndex], "Abhijit", "good"));
    }
    const pradoshaEnd = muhurta.night[data.pradosha.nightMuhurtaCount - 1].endTime;
    intervals.push(windowOf({ startTime: snapshot.anchors.sunsetToday, endTime: pradoshaEnd }, "Pradoṣa", "good"));
    const godhuliHalfMs = data.godhuli.halfWidthGhati * Ghati.FIXED_SECONDS_PER_GHATI * 1000;
    const sunset = snapshot.anchors.sunsetToday.getTime();
    intervals.push(windowOf({ startTime: new Date(sunset - godhuliHalfMs), endTime: new Date(sunset + godhuliHalfMs) }, "Godhūli", "good"));
    // Varjyam / Amṛta Kālam: 4 "ghaṭīs" of each nakṣatra touching this day,
    // where a ghaṭī here is 1/60 of that nakṣatra's own full length (its
    // true start/end, not the part clipped to this day). Windows falling
    // outside the day are dropped by buildGoodBadTimes.
    const va = data.varjyamAmrita;
    snapshot.nakshatraSequence.forEach(function (n) {
      const ghatiMs = (n.endTime.getTime() - n.startTime.getTime()) / 60;
      function nakWindow(startGhati) {
        const t = n.startTime.getTime() + startGhati * ghatiMs;
        return { startTime: new Date(t), endTime: new Date(t + va.windowGhati * ghatiMs) };
      }
      intervals.push(windowOf(nakWindow(va.varjyamStartGhati[n.index]), "Varjyam", "bad"));
      intervals.push(windowOf(nakWindow(va.amritaStartGhati[n.index]), "Amṛta Kālam", "good"));
    });
    return intervals;
  }

  // Shared helper for the three nakshatra-sequence-driven good/bad rings
  // below (Marana/Amrita Yogam, Sarvartha Siddhi, Ravi Yoga): walk the same
  // nakshatraSequence the Nakshatra ring itself uses, and for each clipped
  // segment decide whether `isActive(entry)` holds - if so the segment gets
  // `label` and `goodBad`; if not it's left blank/neutral (same convention
  // renderRing already uses for "no value here").
  function buildNakshatraDrivenRing(snapshot, label, goodBad, isActive) {
    return snapshot.nakshatraSequence.map(function (entry) {
      const active = isActive(entry);
      return {
        startAngle: null, endAngle: null,
        startTime: entry.segStart, endTime: entry.segEnd,
        text: active ? label : "",
        contested: false,
        goodBad: active ? goodBad : undefined,
      };
    });
  }

  function buildMaranaYoga(snapshot, data) {
    const v = snapshot.varaIndex;
    const table = data.nityaYoga.table;
    return buildNakshatraDrivenRing(snapshot, "Maraṇa Yogam", "bad", function (entry) {
      return table[entry.index][v] === "M";
    });
  }

  function buildAmritaYoga(snapshot, data) {
    const v = snapshot.varaIndex;
    const table = data.nityaYoga.table;
    return buildNakshatraDrivenRing(snapshot, "Amṛta Yogam", "good", function (entry) {
      return table[entry.index][v] === "A";
    });
  }

  function buildSarvarthaSiddhiYoga(snapshot, data) {
    const list = data.sarvarthaSiddhiYoga.nakshatraIndicesByWeekday[snapshot.varaIndex];
    return buildNakshatraDrivenRing(snapshot, "Sarvārtha Siddhi", "good", function (entry) {
      return list.indexOf(entry.index) !== -1;
    });
  }

  // Ravi Yoga: unlike the three rings above, the qualifying condition isn't
  // a weekday x nakshatra table lookup - it's a count from the Sun's
  // (effectively day-constant) nakshatra to the Moon's, so it's computed
  // directly rather than via a data-file table (see nityaYoga/raviYoga notes
  // in panchanga-data.json for why).
  function buildRaviYoga(snapshot, data) {
    const sunIdx = snapshot.sunNakshatraIndex;
    const counts = data.raviYoga.qualifyingCounts;
    return buildNakshatraDrivenRing(snapshot, "Ravi Yoga", "good", function (entry) {
      const count = ((entry.index - sunIdx + 27) % 27) + 1;
      return counts.indexOf(count) !== -1;
    });
  }

  // Visha Yoga is tithi-driven (weekday x paksha-relative tithi), not
  // nakshatra-driven, so it walks tithiSequence instead.
  function buildVishaYoga(snapshot, data) {
    const target = data.vishaYoga.tithiByWeekday[snapshot.varaIndex];
    return snapshot.tithiSequence.map(function (entry) {
      const active = entry.pakshaIndex === target;
      return {
        startAngle: null, endAngle: null,
        startTime: entry.segStart, endTime: entry.segEnd,
        text: active ? "Viṣa Yoga" : "",
        contested: false,
        goodBad: active ? "bad" : undefined,
      };
    });
  }

  function buildHora(snapshot, data) {
    const anchors = snapshot.anchors;
    const r = snapshot.scaledRings.hora;
    const order = data.hora.chaldeanOrder;
    const startPlanet = data.hora.weekdayStartPlanet[snapshot.varaIndex];
    const startIdx = order.indexOf(startPlanet);
    const all = r.day.concat(r.night); // 24 continuous hora indices from sunrise
    return all.map(function (iv, horaIndex) {
      const planet = order[(startIdx + horaIndex) % order.length];
      return segmentFromInterval(iv, anchors, data.hora.names[planet], false);
    });
  }

  // Tithi/nakshatra rings: show EVERY value that actually occurs between
  // sunrise and next sunrise, each with its own true (clipped) boundaries -
  // not just "current" forced to start at ghati 0. If Rohini held from
  // sunrise to ghati 12 and Mrigashira from ghati 12 onward, the 0-12 span
  // must read Rohini, not get relabelled Mrigashira just because that's
  // what's current at query time. Colouring is by POSITION in the sequence
  // (user-specified): the first entry (sunrise to the first boundary) gets
  // one colour, every entry after the first boundary gets the other -
  // this is independent of which one happens to be "current" right now,
  // since the hand already shows that. Colouring alternates by position
  // (dial.js's `alternate` option), so a 3rd entry in the day gets the
  // first entry's colour again rather than repeating the second's.
  // `extraFor`, when given, adds a second tooltip line (e.g. the Amanta
  // lunar month for the tithi ring) without affecting the on-ring label.
  function buildSequenceSegments(sequence, labelFor, extraFor) {
    return sequence.map(function (entry, i) {
      return {
        startAngle: null, endAngle: null,
        startTime: entry.segStart, endTime: entry.segEnd,
        text: labelFor(entry), contested: false,
        isCurrentValue: entry.isCurrent,
        extraTooltip: extraFor ? extraFor(entry) : undefined,
      };
    });
  }

  function build(ringKey, snapshot, data) {
    const anchors = snapshot.anchors;
    let segments;
    let title;

    switch (ringKey) {
      case "muhurta":
        title = RING_TITLES.muhurta;
        segments = buildSimpleDivided(snapshot.scaledRings.muhurta.day, snapshot.scaledRings.muhurta.night, anchors, data.muhurta.day, data.muhurta.night);
        break;
      case "prahara":
        title = RING_TITLES.prahara;
        segments = buildSimpleDivided(snapshot.scaledRings.prahara.day, snapshot.scaledRings.prahara.night, anchors, data.prahara.day, data.prahara.night);
        break;
      case "kala":
        title = RING_TITLES.kala;
        segments = buildKala(snapshot, data);
        break;
      case "hora":
        title = RING_TITLES.hora;
        segments = buildHora(snapshot, data);
        break;
      case "tithi": {
        title = RING_TITLES.tithi;
        segments = buildSequenceSegments(
          snapshot.tithiSequence,
          function (t) { return tithiName(t, data); },
          function (t) { return "Māsa: " + data.amantaMasa.names[t.amantaMasaRashiIndex] + " (Amānta)"; }
        );
        break;
      }
      case "nakshatra": {
        title = RING_TITLES.nakshatra;
        segments = buildSequenceSegments(snapshot.nakshatraSequence, function (n) {
          return data.nakshatra.names[n.index];
        });
        break;
      }
      case "yoga":
        title = RING_TITLES.yoga;
        segments = buildSequenceSegments(snapshot.yogaSequence, function (y) { return data.yoga.names[y.index]; });
        break;
      case "karana":
        title = RING_TITLES.karana;
        segments = buildSequenceSegments(snapshot.karanaSequence, function (k) {
          return k.key.indexOf("movable:") === 0 ? data.karana.movable[Number(k.key.split(":")[1])] : data.karana.fixed[k.key];
        });
        break;
      case "lagna":
        title = RING_TITLES.lagna;
        segments = buildSequenceSegments(snapshot.lagnaSequence, function (l) { return data.rashi.names[l.index]; });
        break;
      default:
        throw new Error("Unknown ring key: " + ringKey);
    }

    finalizeSegments(segments, anchors);
    return { ringKey: ringKey, title: title, segments: segments };
  }

  function activeIntervalsFor(label, goodBad, segments) {
    return segments.filter(function (seg) { return seg.text; }).map(function (seg) {
      return { startTime: seg.startTime, endTime: seg.endTime, text: label, goodBad: goodBad };
    });
  }

  // Clips `intervals` to [dayStart, dayEnd], drops empty ones, joins
  // back-to-back pieces of the same window (e.g. Amṛta Yogam holding over
  // two consecutive nakṣatras) into one event, and assigns each event a
  // LANE - a thin sub-ring of its ring - such that no two events in the
  // same lane overlap in time. That is what lets every window keep its own
  // colour and its own label, instead of overlaps being merged into one
  // shared "X + Y" block: windows that clash go side by side in different
  // lanes, windows that never meet share one. Lane 0 is the outermost.
  function layoutEvents(intervals, dayStart, dayEnd) {
    const lo = dayStart.getTime(), hi = dayEnd.getTime();
    const clipped = intervals.map(function (iv) {
      return {
        startTime: new Date(Math.max(lo, iv.startTime.getTime())),
        endTime: new Date(Math.min(hi, iv.endTime.getTime())),
        text: iv.text, goodBad: iv.goodBad, contested: false,
      };
    }).filter(function (ev) { return ev.endTime > ev.startTime; })
      .sort(function (a, b) { return a.startTime - b.startTime || b.endTime - a.endTime; });

    // Consecutive nakṣatra/tithi pieces can be a second or so apart at the
    // join (each boundary is its own root-finding search), so "back-to-back"
    // allows a small slack.
    const JOIN_SLACK_MS = 60 * 1000;
    const events = [];
    clipped.forEach(function (ev) {
      const joinable = events.find(function (e) { return e.text === ev.text && Math.abs(ev.startTime - e.endTime) <= JOIN_SLACK_MS; });
      if (joinable) joinable.endTime = ev.endTime;
      else events.push(ev);
    });
    events.sort(function (a, b) { return a.startTime - b.startTime || b.endTime - a.endTime; });

    const laneEnds = [];
    events.forEach(function (ev) {
      let lane = laneEnds.findIndex(function (end) { return end <= ev.startTime.getTime(); });
      if (lane === -1) { lane = laneEnds.length; laneEnds.push(0); }
      laneEnds[lane] = ev.endTime.getTime();
      ev.lane = lane;
    });
    return { events: events, laneCount: Math.max(1, laneEnds.length) };
  }

  // The two halves of the always-on Good / Bad Times ring. Each holds the
  // day's daily windows of its kind (dailyWindows above) plus the five
  // weekday x nakshatra/tithi combination yogas that used to have a ring of
  // their own - Maraṇa Yogam and Viṣa Yoga (bad), Amṛta Yogam, Sarvārtha
  // Siddhi and Ravi Yoga (good) - each event in its own lane (layoutEvents).
  function buildGoodBadTimes(snapshot, data) {
    const a = snapshot.anchors;
    const all = dailyWindows(snapshot, data)
      .concat(activeIntervalsFor("Maraṇa Yogam", "bad", buildMaranaYoga(snapshot, data)))
      .concat(activeIntervalsFor("Viṣa Yoga", "bad", buildVishaYoga(snapshot, data)))
      .concat(activeIntervalsFor("Amṛta Yogam", "good", buildAmritaYoga(snapshot, data)))
      .concat(activeIntervalsFor("Sarvārtha Siddhi", "good", buildSarvarthaSiddhiYoga(snapshot, data)))
      .concat(activeIntervalsFor("Ravi Yoga", "good", buildRaviYoga(snapshot, data)));
    function ring(key, goodBad) {
      const laid = layoutEvents(all.filter(function (iv) { return iv.goodBad === goodBad; }), a.governingSunrise, a.nextSunrise);
      finalizeSegments(laid.events, a);
      return { ringKey: key, title: key === "goodTimes" ? "Good Times" : "Bad Times", segments: laid.events, laneCount: laid.laneCount };
    }
    return { good: ring("goodTimes", "good"), bad: ring("badTimes", "bad") };
  }

  // One line of the centre readout's status, for one half of the Good /
  // Bad Times ring: what is active right now and until when, or, if
  // nothing is, what comes next. When several windows are active at once
  // the one ending soonest is named (the short, strict windows like Rāhu
  // Kālam end before the day-long yogas), with a count of the rest.
  // Returns { active, text, until } or { active: false, text, at } or null.
  function statusFor(ringDescriptor, now) {
    const events = ringDescriptor.segments;
    const active = events.filter(function (e) { return e.startTime <= now && now < e.endTime; })
      .sort(function (a, b) { return a.endTime - b.endTime; });
    if (active.length) {
      return { active: true, text: active[0].text + (active.length > 1 ? " +" + (active.length - 1) : ""), until: active[0].endTime };
    }
    const next = events.filter(function (e) { return e.startTime > now; })
      .sort(function (a, b) { return a.startTime - b.startTime; })[0];
    return next ? { active: false, text: next.text, at: next.startTime } : null;
  }

  // "Saptamī (kṛṣṇa)": the tithi holding at `now`, named the same way the
  // tithi ring names it.
  function tithiNameAt(snapshot, data, now) {
    const entry = snapshot.tithiSequence.find(function (t) { return t.segStart <= now && now < t.segEnd; }) || snapshot.tithiSequence[0];
    return tithiName(entry, data);
  }
  function tithiName(t, data) {
    // The 15th is "Pūrṇimā/Amāvāsyā" in the data - name the one it is.
    const name = data.tithi.names[t.pakshaIndex - 1].split("/")[t.pakshaIndex === 15 && t.paksha === "krishna" ? 1 : 0];
    return name + " (" + PAKSHA_LABEL[t.paksha] + ")";
  }

  // Always-on innermost ring: just day (sunrise->sunset) and night
  // (sunset->next sunrise), two segments, always. Not part of RING_ORDER -
  // it never toggles, same as the good/bad time rings.
  function buildDayNight(snapshot) {
    const a = snapshot.anchors;
    const segments = [
      { startTime: a.governingSunrise, endTime: a.sunsetToday, text: "Day", isDay: true, contested: false },
      { startTime: a.sunsetToday, endTime: a.nextSunrise, text: "Night", isDay: false, contested: false },
    ];
    finalizeSegments(segments, a);
    return { ringKey: "dayNight", title: "Day/Night", segments: segments };
  }

  // Avartana (midpoint of sunrise..sunset) and Nishitha (midpoint of
  // sunset..next sunrise), for dial.js's marker lines.
  //
  // Plus the other point-in-time events of the day (any of which can be
  // hidden in Settings, by key - see MARKER_TITLES):
  //  - Aruṇodaya: 4 ghaṭī (96 min) before the next sunrise.
  //  - Candrodaya / Candrāsta: moonrise / moonset, when they fall in this
  //    Vedic day (engine/day-events.js).
  //  - Saṅkrānti: the Sun entering a new rāśi, only on the day it happens.
  function buildDayMarkers(snapshot, data, hiddenKeys) {
    const a = snapshot.anchors;
    const ev = snapshot.dayEvents;
    function mid(t1, t2) { return new Date((t1.getTime() + t2.getTime()) / 2); }
    const markers = [
      { key: "avartana", text: MARKER_TITLES.avartana, time: mid(a.governingSunrise, a.sunsetToday) },
      { key: "nishitha", text: MARKER_TITLES.nishitha, time: mid(a.sunsetToday, a.nextSunrise) },
      { key: "arunodaya", text: MARKER_TITLES.arunodaya, time: new Date(a.nextSunrise.getTime() - 4 * Ghati.FIXED_SECONDS_PER_GHATI * 1000) },
    ];
    if (ev.moonrise) markers.push({ key: "moonrise", text: MARKER_TITLES.moonrise, time: ev.moonrise });
    if (ev.moonset) markers.push({ key: "moonset", text: MARKER_TITLES.moonset, time: ev.moonset });
    // The line's label is just "Saṅkrānti" (the full name is too long for
    // the space outside the rings); the tooltip names the rāśi.
    if (ev.sankranti) markers.push({ key: "sankranti", text: MARKER_TITLES.sankranti, tooltipTitle: data.rashi.names[ev.sankranti.rashiIndex] + " Saṅkrānti", time: ev.sankranti.time });
    return markers.filter(function (m) { return (hiddenKeys || []).indexOf(m.key) === -1; }).map(function (m) {
      m.angle = angleOf(m.time, a);
      m.ghatiPala = ghatiPalaLabel(m.time, a);
      return m;
    });
  }

  // Marks for the hour-mode scale (the "Switch time" view): the 24 whole IST
  // clock hours, each at its true angle on the same sunrise-anchored scale
  // every ring uses (fixed-rate: 60 ghati = 24h, so no ring has to move),
  // plus the sunrise time itself, which always sits at the top.
  const IST_OFFSET_MS = 5.5 * 3600 * 1000;
  const HOUR_MS = 3600 * 1000;
  function buildHourScale(snapshot) {
    const anchors = snapshot.anchors;
    const sunrise = anchors.governingSunrise;
    const firstHour = Math.ceil((sunrise.getTime() + IST_OFFSET_MS) / HOUR_MS) * HOUR_MS - IST_OFFSET_MS;
    const hours = [];
    for (let i = 0; i < 24; i++) {
      const t = new Date(firstHour + i * HOUR_MS);
      hours.push({ angle: angleOf(t, anchors), hour: (Math.round((t.getTime() + IST_OFFSET_MS) / HOUR_MS)) % 24 });
    }
    const sunriseLabel = sunrise.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: false, hour: "2-digit", minute: "2-digit" });
    return { hours: hours, sunriseLabel: sunriseLabel };
  }

  VedicEngine.RingAdapter = { build, buildDayNight, buildGoodBadTimes, statusFor, tithiNameAt, buildDayMarkers, buildHourScale, RING_ORDER, RING_TITLES, START_LABEL_RINGS, MARKER_TITLES, FIXED_RING_TITLES };
})(typeof window !== "undefined" ? window : globalThis);
