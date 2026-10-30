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
  // Rahu/Yama/Gulika and the good/bad nitya-yoga rings (Marana, Amrita,
  // Sarvartha Siddhi, Ravi, Visha) are likewise always-on now (see
  // buildGoodBadRings below) rather than taking a turn here. Yoga (the
  // 27-fold Vishkambha..Vaidhriti cycle) and Karana were dropped entirely
  // per the project owner's request - no ring shows them any more.
  const RING_ORDER = ["muhurta", "prahara", "kala", "hora"];

  // Static display titles, for UI (e.g. the settings ring-order list) that
  // needs a label without computing a full snapshot. Kept in sync with the
  // `title` values set in build() below.
  const RING_TITLES = {
    muhurta: "Muhurta", prahara: "Yaama", kala: "Kala", hora: "Hora",
    tithi: "Tithi", nakshatra: "Nakshatra",
  };

  // `anchors` is snapshot.anchors ({governingSunrise, sunsetToday, nextSunrise,
  // previousSunset}) - Ghati.angleForTime needs the whole thing now that the
  // ghati scale is day/night-rescaled rather than a single fixed rate.
  function angleOf(date, anchors) {
    return Ghati.angleForTime(date, anchors);
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
    const night = combinedBand(r.night, anchors, "Night (kala not defined)", true);
    if (night) segments.push(night);
    return segments;
  }

  // All three named segments are inauspicious (bad/red); the "not covered"
  // night band keeps its existing `contested` (dashed, data-gap) styling
  // rather than being marked bad - it means "unknown", not "confirmed bad".
  function buildRahuYamaGulika(snapshot, data) {
    const anchors = snapshot.anchors;
    const r = snapshot.scaledRings.rahuYamaGulika;
    const idx = data.rahuYamaGulika.weekdaySegmentIndex;
    const v = snapshot.varaIndex;
    const named = {};
    named[idx.rahu[v]] = "Rahu Kalam";
    named[idx.yamaganda[v]] = "Yamaganda";
    named[idx.gulika[v]] = "Gulika Kalam";
    const segments = r.day.map(function (iv, i) {
      const label = named[i] || "";
      const seg = segmentFromInterval(iv, anchors, label, false);
      if (label) seg.goodBad = "bad";
      return seg;
    });
    const night = combinedBand(r.night, anchors, "Night (not covered)", true);
    if (night) segments.push(night);
    return segments;
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
  // since the hand already shows that.
  // `extraFor`, when given, adds a second tooltip line (e.g. the Amanta
  // lunar month for the tithi ring) without affecting the on-ring label.
  function buildSequenceSegments(sequence, labelFor, extraFor) {
    return sequence.map(function (entry, i) {
      return {
        startAngle: null, endAngle: null,
        startTime: entry.segStart, endTime: entry.segEnd,
        text: labelFor(entry), contested: false,
        isCurrentValue: entry.isCurrent, isNext: i > 0,
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
      default:
        throw new Error("Unknown ring key: " + ringKey);
    }

    // Fill in angles for the "single current value" rings now that we have anchors.
    segments.forEach(function (seg) {
      if (seg.startAngle == null) {
        seg.startAngle = angleOf(seg.startTime, anchors);
        seg.endAngle = angleOf(seg.endTime, anchors);
      }
    });

    return { ringKey: ringKey, title: title, segments: segments };
  }

  // Always-on "good/bad time" rings: Rahu/Yama/Gulika plus five weekday x
  // nakshatra/tithi combination yogas (Marana, Amrita, Sarvartha Siddhi,
  // Ravi, Visha). Each ring spans the full sunrise-to-sunrise day like
  // tithi/nakshatra do, but most of that span is blank/neutral - only the
  // qualifying stretch(es) get a label, coloured bad (red) or good (blue)
  // per dial.js/style.css. Order here is outer-to-inner render order in
  // dial.js: bad rings first (next to the switchable outer ring), good
  // rings outermost.
  function buildGoodBadRings(snapshot, data) {
    const anchors = snapshot.anchors;
    const rings = [
      { ringKey: "rahuYamaGulika", title: "Rahu / Yama / Gulika", segments: buildRahuYamaGulika(snapshot, data) },
      { ringKey: "maranaYoga", title: "Marana Yogam", segments: buildMaranaYoga(snapshot, data) },
      { ringKey: "vishaYoga", title: "Visha Yoga", segments: buildVishaYoga(snapshot, data) },
      { ringKey: "amritaYoga", title: "Amrita Yogam", segments: buildAmritaYoga(snapshot, data) },
      { ringKey: "sarvarthaSiddhiYoga", title: "Sarvartha Siddhi", segments: buildSarvarthaSiddhiYoga(snapshot, data) },
      { ringKey: "raviYoga", title: "Ravi Yoga", segments: buildRaviYoga(snapshot, data) },
    ];
    rings.forEach(function (ring) {
      ring.segments.forEach(function (seg) {
        if (seg.startAngle == null) {
          seg.startAngle = angleOf(seg.startTime, anchors);
          seg.endAngle = angleOf(seg.endTime, anchors);
        }
      });
    });
    return rings;
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
    segments.forEach(function (seg) {
      seg.startAngle = angleOf(seg.startTime, a);
      seg.endAngle = angleOf(seg.endTime, a);
    });
    return { ringKey: "dayNight", title: "Day/Night", segments: segments };
  }

  VedicEngine.RingAdapter = { build, buildDayNight, buildGoodBadRings, RING_ORDER, RING_TITLES };
})(typeof window !== "undefined" ? window : globalThis);
