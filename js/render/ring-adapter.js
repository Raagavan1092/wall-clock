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

  // Tithi and nakshatra are checked constantly, so they get their own always-
  // visible thin rings (dial.js) instead of taking a turn in this toggle.
  // "rahuYamaGulika" (titled Good / Bad Times: Rahu/Yama/Gulika plus
  // Durmuhurta and Abhijit) has something to show EVERY day, unlike the five
  // nitya-yoga rings below, so it earns a permanent spot in the cycle the
  // same way Muhurta/Yaama/Kala/Hora do. Yoga (the 27-fold Vishkambha..
  // Vaidhriti cycle), Karana and Lagna were added back to the cycle at the
  // project owner's request, completing the five limbs alongside vara,
  // tithi and nakshatra.
  const RING_ORDER = ["muhurta", "prahara", "kala", "hora", "rahuYamaGulika", "yoga", "karana", "lagna"];

  // Static display titles, for UI (e.g. the settings ring-order list) that
  // needs a label without computing a full snapshot. Kept in sync with the
  // `title` values set in build() below.
  const RING_TITLES = {
    muhurta: "Muhurta", prahara: "Yaama", kala: "Kala", hora: "Hora",
    rahuYamaGulika: "Good / Bad Times",
    yoga: "Yoga", karana: "Karana", lagna: "Lagna",
    tithi: "Tithi", nakshatra: "Nakshatra",
  };

  // `anchors` is snapshot.anchors ({governingSunrise, sunsetToday, nextSunrise,
  // previousSunset}) - Ghati.angleForTime needs the whole thing now that the
  // ghati scale is day/night-rescaled rather than a single fixed rate.
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
  // top-level builder (build()'s switch, buildDayNight, buildYogaAlerts).
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
  // breakdown for night, e.g. kala, rahuYamaGulika).
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

  // The daily good/bad time windows, on one ring ("Good / Bad Times"):
  // Rahu Kalam, Yamaganda, Gulika Kalam and Durmuhurta (bad), and Abhijit
  // (good). They can overlap (e.g. Wednesday's Rahu Kalam and midday), so
  // they go through the same merge as the yoga ring - an overlap of a good
  // and a bad window gets the "mixed" colour. Everything else is blank.
  function buildRahuYamaGulika(snapshot, data) {
    const r = snapshot.scaledRings.rahuYamaGulika;
    const muhurta = snapshot.scaledRings.muhurta;
    const idx = data.rahuYamaGulika.weekdaySegmentIndex;
    const v = snapshot.varaIndex;
    function windowOf(iv, text, goodBad) {
      return { startTime: iv.startTime, endTime: iv.endTime, text: text, goodBad: goodBad };
    }
    const intervals = [
      windowOf(r.day[idx.rahu[v]], "Rahu Kalam", "bad"),
      windowOf(r.day[idx.yamaganda[v]], "Yamaganda", "bad"),
      windowOf(r.day[idx.gulika[v]], "Gulika Kalam", "bad"),
    ];
    data.durmuhurta.byWeekday[v].forEach(function (d) {
      intervals.push(windowOf(muhurta[d.part][d.index], "Durmuhurta", "bad"));
    });
    if (data.abhijit.skipWeekdays.indexOf(v) === -1) {
      intervals.push(windowOf(muhurta.day[data.abhijit.dayIndex], "Abhijit", "good"));
    }
    return mergeActiveIntervals(intervals, snapshot.anchors.governingSunrise, snapshot.anchors.nextSunrise);
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
    return buildNakshatraDrivenRing(snapshot, "Marana Yogam", "bad", function (entry) {
      return table[entry.index][v] === "M";
    });
  }

  function buildAmritaYoga(snapshot, data) {
    const v = snapshot.varaIndex;
    const table = data.nityaYoga.table;
    return buildNakshatraDrivenRing(snapshot, "Amrita Yogam", "good", function (entry) {
      return table[entry.index][v] === "A";
    });
  }

  function buildSarvarthaSiddhiYoga(snapshot, data) {
    const list = data.sarvarthaSiddhiYoga.nakshatraIndicesByWeekday[snapshot.varaIndex];
    return buildNakshatraDrivenRing(snapshot, "Sarvartha Siddhi", "good", function (entry) {
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
        text: active ? "Visha Yoga" : "",
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
      return segmentFromInterval(iv, anchors, planet, false);
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
        title = "Muhurta";
        segments = buildSimpleDivided(snapshot.scaledRings.muhurta.day, snapshot.scaledRings.muhurta.night, anchors, data.muhurta.day, data.muhurta.night);
        break;
      case "prahara":
        title = "Yaama";
        segments = buildSimpleDivided(snapshot.scaledRings.prahara.day, snapshot.scaledRings.prahara.night, anchors, data.prahara.day, data.prahara.night);
        break;
      case "kala":
        title = "Kala";
        segments = buildKala(snapshot, data);
        break;
      case "hora":
        title = "Hora";
        segments = buildHora(snapshot, data);
        break;
      case "rahuYamaGulika":
        title = RING_TITLES.rahuYamaGulika;
        segments = buildRahuYamaGulika(snapshot, data);
        break;
      case "tithi": {
        title = "Tithi";
        segments = buildSequenceSegments(
          snapshot.tithiSequence,
          function (t) { return data.tithi.names[t.pakshaIndex - 1] + " (" + t.paksha + ")"; },
          function (t) { return "Masa: " + data.amantaMasa.names[t.amantaMasaRashiIndex] + " (Amanta)"; }
        );
        break;
      }
      case "nakshatra": {
        title = "Nakshatra";
        segments = buildSequenceSegments(snapshot.nakshatraSequence, function (n) {
          return data.nakshatra.names[n.index];
        });
        break;
      }
      case "yoga":
        title = "Yoga";
        segments = buildSequenceSegments(snapshot.yogaSequence, function (y) { return data.yoga.names[y.index]; });
        break;
      case "karana":
        title = "Karana";
        segments = buildSequenceSegments(snapshot.karanaSequence, function (k) {
          return k.key.indexOf("movable:") === 0 ? data.karana.movable[Number(k.key.split(":")[1])] : data.karana.fixed[k.key];
        });
        break;
      case "lagna":
        title = "Lagna";
        segments = buildSequenceSegments(snapshot.lagnaSequence, function (l) { return data.rashi.names[l.index]; });
        break;
      default:
        throw new Error("Unknown ring key: " + ringKey);
    }

    finalizeSegments(segments, anchors);
    return { ringKey: ringKey, title: title, segments: segments };
  }

  // Merges the five weekday x nakshatra/tithi combination yogas (Marana,
  // Amrita, Sarvartha Siddhi, Ravi, Visha - NOT Rahu/Yama/Gulika, which has
  // its own permanent ring instead; see RING_ORDER above) into one ring's
  // worth of segments, spanning the full sunrise-to-sunrise day. Most of
  // that span is blank (no segment text) - only stretches where at least
  // one of the five is actually active get a label, coloured bad (red) or
  // good (blue) per dial.js/style.css. Two different sources can be active
  // at once (e.g. Marana Yogam's nakshatra-based span overlapping Visha
  // Yoga's tithi-based one, or even a good one overlapping a bad one) -
  // when that happens the segment names everything active ("X + Y") and
  // reads good (blue) or bad (red) if every active source agrees, or
  // "mixed" (purple, the blend of the two) when a good and a bad one
  // overlap - per the project owner, so the overlap is visible rather than
  // either colour masking the other.
  // `label`, when given, overrides every active segment's own text with one
  // fixed name (used for the nakshatra/tithi-driven yogas, which are each a
  // single yes/no condition).
  function activeIntervalsFor(label, goodBad, segments) {
    return segments.filter(function (seg) { return seg.text; }).map(function (seg) {
      return { startTime: seg.startTime, endTime: seg.endTime, text: label == null ? seg.text : label, goodBad: goodBad };
    });
  }

  function mergeActiveIntervals(intervals, dayStart, dayEnd) {
    const boundaryMs = {};
    boundaryMs[dayStart.getTime()] = true;
    boundaryMs[dayEnd.getTime()] = true;
    intervals.forEach(function (iv) {
      boundaryMs[iv.startTime.getTime()] = true;
      boundaryMs[iv.endTime.getTime()] = true;
    });
    const points = Object.keys(boundaryMs).map(Number)
      .filter(function (t) { return t >= dayStart.getTime() && t <= dayEnd.getTime(); })
      .sort(function (a, b) { return a - b; });

    const segments = [];
    for (let i = 0; i < points.length - 1; i++) {
      const segStartMs = points[i], segEndMs = points[i + 1];
      if (segEndMs <= segStartMs) continue;
      const midMs = (segStartMs + segEndMs) / 2;
      const active = intervals.filter(function (iv) { return iv.startTime.getTime() <= midMs && iv.endTime.getTime() > midMs; });
      const seg = { startAngle: null, endAngle: null, startTime: new Date(segStartMs), endTime: new Date(segEndMs), contested: false };
      if (active.length) {
        seg.text = active.map(function (a) { return a.text; }).join(" + ");
        const anyBad = active.some(function (a) { return a.goodBad === "bad"; });
        const anyGood = active.some(function (a) { return a.goodBad === "good"; });
        seg.goodBad = anyBad && anyGood ? "mixed" : anyBad ? "bad" : "good";
      } else {
        seg.text = "";
      }
      segments.push(seg);
    }
    return segments;
  }

  // Five yoga types are accounted for here: Marana Yogam, Visha Yoga (bad),
  // Amrita Yogam, Sarvartha Siddhi, Ravi Yoga (good). Realistically at most
  // 2-3 of these are ever active at the same moment (they're independent
  // conditions on independent clocks - nakshatra for four of them, tithi for
  // Visha - so overlaps happen but aren't the common case).
  //
  // Unlike every other ring here, this one is NOT part of RING_ORDER - it's
  // not something you switch to, it's meant to surface itself: dial.js only
  // draws it (as an extra ring outside the switchable one) when at least one
  // segment is active somewhere in the day, and draws nothing at all - no
  // ring, no boundary, no reserved space - on a day none of the five apply.
  // See dial.js renderYogaAlertRing.
  function buildYogaAlerts(snapshot, data) {
    const intervals = []
      .concat(activeIntervalsFor("Marana Yogam", "bad", buildMaranaYoga(snapshot, data)))
      .concat(activeIntervalsFor("Visha Yoga", "bad", buildVishaYoga(snapshot, data)))
      .concat(activeIntervalsFor("Amrita Yogam", "good", buildAmritaYoga(snapshot, data)))
      .concat(activeIntervalsFor("Sarvartha Siddhi", "good", buildSarvarthaSiddhiYoga(snapshot, data)))
      .concat(activeIntervalsFor("Ravi Yoga", "good", buildRaviYoga(snapshot, data)));

    const segments = mergeActiveIntervals(intervals, snapshot.anchors.governingSunrise, snapshot.anchors.nextSunrise);
    finalizeSegments(segments, snapshot.anchors);
    return { ringKey: "yogaAlerts", title: "Yogas", segments: segments };
  }

  // Always-on innermost ring: just day (sunrise->sunset) and night
  // (sunset->next sunrise), two segments, always. Not part of RING_ORDER -
  // it never toggles, same as tithi/nakshatra.
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
  function buildDayMarkers(snapshot) {
    const a = snapshot.anchors;
    function mid(t1, t2) { return new Date((t1.getTime() + t2.getTime()) / 2); }
    return [
      { text: "Avartana", time: mid(a.governingSunrise, a.sunsetToday) },
      { text: "Nishitha", time: mid(a.sunsetToday, a.nextSunrise) },
    ].map(function (m) {
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

  VedicEngine.RingAdapter = { build, buildDayNight, buildYogaAlerts, buildDayMarkers, buildHourScale, RING_ORDER, RING_TITLES };
})(typeof window !== "undefined" ? window : globalThis);
