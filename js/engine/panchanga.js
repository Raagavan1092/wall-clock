// Orchestrator: Date + settings -> one plain-data snapshot with everything the
// renderer needs. This is the only module the renderer should ever call into;
// it never touches astronomy-engine or the DOM itself (engine/renderer
// separation per spec).
(function (global) {
  "use strict";

  const VedicEngine = global.VedicEngine = global.VedicEngine || {};
  const { Sunrise, Ghati, Util, Tithi, Nakshatra, Yoga, Karana, Lagna, DayEvents, Masa, ScaledIntervals } = VedicEngine;

  const DEFAULT_SETTINGS = {
    location: {
      latitude: 13.4200,
      longitude: 75.2500,
      elevation: 672, // meters; see plan notes - verified against public sources, editable in settings
      utcOffsetMinutes: 330, // IST, no DST
    },
    ayanamsa: "lahiri",
    sunriseEdge: "upper-limb", // "upper-limb" (default) or "disc-centre"
  };

  const SCALED_RING_DIVISIONS = {
    muhurta: 15,
    prahara: 4,
    kala: 5,
    rahuYamaGulika: 8,
    hora: 12,
  };

  function mergeSettings(overrides) {
    overrides = overrides || {};
    return {
      location: Object.assign({}, DEFAULT_SETTINGS.location, overrides.location),
      ayanamsa: overrides.ayanamsa || DEFAULT_SETTINGS.ayanamsa,
      sunriseEdge: overrides.sunriseEdge || DEFAULT_SETTINGS.sunriseEdge,
    };
  }

  // The full snapshot for `date` (a JS Date, typically "now" or the debug-scrubbed time).
  function compute(date, settingsOverrides) {
    const settings = mergeSettings(settingsOverrides);
    const location = settings.location;
    const edge = settings.sunriseEdge;

    // Resolve the sunrise that governs "now" first (per spec: before today's
    // sunrise, everything - vara, ghati count - belongs to the previous Vedic day).
    const governingSunrise = Sunrise.sunriseAtOrBefore(location, date, edge);
    if (!governingSunrise) {
      throw new Error("Could not find a governing sunrise before " + date.toISOString());
    }
    const sunsetToday = Sunrise.sunsetAfter(location, governingSunrise, edge);
    const nextSunrise = Sunrise.sunriseAfter(location, governingSunrise, edge);
    const previousSunset = Sunrise.sunsetBefore(location, governingSunrise, edge);
    if (!sunsetToday || !nextSunrise || !previousSunset) {
      throw new Error("Could not bracket the current solar day for " + date.toISOString());
    }

    const anchors = { previousSunset, governingSunrise, sunsetToday, nextSunrise };
    const ghati = Ghati.current(date, anchors);
    const varaIndex = Util.weekdayAtOffset(governingSunrise, location.utcOffsetMinutes);

    const tithi = Tithi.current(date);
    const nakshatra = Nakshatra.current(date, settings.ayanamsa);
    // Pinned to governingSunrise, same as varaIndex - the Sun's nakshatra
    // moves so slowly (~13.4 days/nakshatra) that "for the whole Vedic day"
    // and "right now" are never meaningfully different, but pinning it here
    // keeps it consistent with vara for the Ravi Yoga ring.
    const sunNakshatraIndex = Nakshatra.sunIndex(governingSunrise, settings.ayanamsa);

    // Full sequence of values from sunrise to next sunrise, each clipped to
    // its true boundaries within that window (NOT forced to start at
    // sunrise). A ring showing "today's" tithi/nakshatra needs this, not just
    // "whatever's current now" - if Rohini was active from sunrise until
    // ghati 12 and Mrigashira from ghati 12 onward, the 0-12 span must be
    // labelled Rohini, not relabelled Mrigashira just because that's what's
    // current at query time. Nudged 1s past each boundary for the same
    // reason sunrise.js nudges its searches - querying exactly AT the
    // instant a value ends can land back on it instead of the next one.
    function buildSequence(computeAt) {
      const sequence = [];
      let t = governingSunrise;
      for (let guard = 0; guard < 20; guard++) { // generous cap; real runs are 1-3 (5-6 for karana, ~13 for lagna)
        const value = computeAt(t);
        const segEnd = value.endTime < nextSunrise ? value.endTime : nextSunrise;
        const isCurrent = date >= t && date < segEnd;
        sequence.push(Object.assign({}, value, { segStart: t, segEnd: segEnd, isCurrent: isCurrent }));
        if (value.endTime >= nextSunrise) break;
        t = new Date(value.endTime.getTime() + 1000);
      }
      return sequence;
    }
    const tithiSequence = buildSequence(Tithi.current).map(function (entry) {
      // Amanta lunar month for this segment, computed from ITS OWN start
      // (not just "now") - correct even on the rare day a lunar-month
      // boundary (new moon) falls within the sunrise-to-sunrise window.
      return Object.assign({}, entry, { amantaMasaRashiIndex: Masa.amantaMasaForDate(entry.segStart, settings.ayanamsa).rashiIndex });
    });
    const nakshatraSequence = buildSequence(function (t) { return Nakshatra.current(t, settings.ayanamsa); });
    const yogaSequence = buildSequence(function (t) { return Yoga.current(t, settings.ayanamsa); });
    const karanaSequence = buildSequence(Karana.current);
    const lagnaSequence = buildSequence(function (t) { return Lagna.current(t, location, settings.ayanamsa); });

    const scaledRings = {};
    Object.keys(SCALED_RING_DIVISIONS).forEach(function (key) {
      scaledRings[key] = ScaledIntervals.dayAndNight(
        governingSunrise,
        sunsetToday,
        nextSunrise,
        SCALED_RING_DIVISIONS[key]
      );
    });

    return {
      date,
      settings,
      anchors,
      varaIndex, // 0=Sunday..6=Saturday, pinned to governingSunrise's calendar date
      // { totalGhati, ghati, pala, vipala, angleDeg } AT `date` ONLY. This
      // snapshot is cached by callers for hours at a time (see app.js's
      // getSnapshot/isExpired), so anyone rendering a live-updating
      // ghati/pala/vipala readout should call Ghati.current(freshNow,
      // anchors) themselves each tick rather than read this field - it goes
      // stale the moment `date` is in the past.
      ghati,
      tithi,
      tithiSequence,
      nakshatra,
      nakshatraSequence,
      yogaSequence,
      karanaSequence,
      lagnaSequence,
      dayEvents: DayEvents.compute(anchors, location, settings.ayanamsa), // moonrise/moonset/saṅkrānti
      sunNakshatraIndex,
      yoga: Yoga.current(date, settings.ayanamsa),
      karana: Karana.current(date),
      scaledRings, // { muhurta, prahara, kala, rahuYamaGulika, hora } -> { day: [...], night: [...] }
    };
  }

  VedicEngine.Panchanga = {
    DEFAULT_SETTINGS,
    SCALED_RING_DIVISIONS,
    mergeSettings,
    compute,
  };
})(typeof window !== "undefined" ? window : globalThis);
