// The ghati/pala/vipala scale: class (1) from the spec ("sunrise-anchored"),
// rendered as a fixed set of evenly-spaced ticks that are never recomputed.
// How a given MOMENT maps onto that scale has two real competing conventions:
//
//  - FIXED-RATE (used here, as the default): 1 ghati = 24 minutes, always,
//    counted from sunrise. Simple, but the count can land above/below 60
//    right before the next sunrise resets it, since no real sunrise-to-
//    sunrise span is exactly 24h - and sunset itself lands wherever the
//    day's actual length puts it (NOT at a round ghati number). E.g. an
//    11h41m day puts sunset at ~29 ghati 12 pala, not 30.
//  - DAY/NIGHT-RESCALED: sunrise-to-sunset is rescaled to exactly 30 ghati,
//    and sunset-to-next-sunrise to another 30 - the same rescaling already
//    used for muhurta/prahara/etc. in scaled-intervals.js, just applied to
//    the ghati count itself. This is what drikpanchang.com's own "Vedic
//    Clock" view uses (confirmed: it shows sunset at exactly "30 Ghati 00
//    Pala"), and what this engine used for a time, but the project owner
//    explicitly chose fixed-rate instead when shown the tradeoff, so this
//    is kept available (see `currentRescaled`) but not the default.
//
// Every ring that places a segment on the dial (muhurta, prahara, kala,
// Rahu/Yama/Gulika, hora, tithi, nakshatra, day/night) goes through
// angleForTime() below, so this one choice governs all of them consistently.
(function (global) {
  "use strict";

  const VedicEngine = global.VedicEngine = global.VedicEngine || {};
  const Util = VedicEngine.Util;

  const PALA_PER_GHATI = 60;
  const VIPALA_PER_PALA = 60;
  const GHATI_PER_HALF_DAY = 30;
  const FIXED_SECONDS_PER_GHATI = 24 * 60; // 1440s = 24 min, the fixed-rate convention

  function fromFraction(totalGhati) {
    const ghati = Math.floor(totalGhati) % 60;
    const fractionalGhati = totalGhati - Math.floor(totalGhati);
    const totalPala = fractionalGhati * PALA_PER_GHATI;
    const pala = Math.floor(totalPala);
    const vipala = Math.floor((totalPala - pala) * VIPALA_PER_PALA);
    const angleDeg = Util.normDeg(totalGhati * 6); // 6 deg per ghati
    // Angle for a second, faster "pala hand" - one full sweep per ghati,
    // the same way a minute hand sweeps once per hour.
    const palaAngleDeg = Util.normDeg(fractionalGhati * 360);
    return { totalGhati, ghati, pala, vipala, angleDeg, fractionalGhati, palaAngleDeg };
  }

  // Fixed-rate (default): 1 ghati = 24 minutes, counted from governingSunrise.
  // `anchors` only needs governingSunrise here, but takes the same
  // {governingSunrise, sunsetToday, nextSunrise} shape as currentRescaled so
  // every call site can use either without changing its own code.
  function current(date, anchors) {
    const totalGhati = (date.getTime() - anchors.governingSunrise.getTime()) / 1000 / FIXED_SECONDS_PER_GHATI;
    return fromFraction(totalGhati);
  }

  // Day/night-rescaled alternative (see file header) - not wired into the
  // dial by default, kept available for comparison/future use.
  function currentRescaled(date, anchors) {
    const { governingSunrise, sunsetToday, nextSunrise } = anchors;
    let totalGhati;
    if (date < sunsetToday) {
      totalGhati = ((date - governingSunrise) / (sunsetToday - governingSunrise)) * GHATI_PER_HALF_DAY;
    } else {
      totalGhati = GHATI_PER_HALF_DAY + ((date - sunsetToday) / (nextSunrise - sunsetToday)) * GHATI_PER_HALF_DAY;
    }
    return fromFraction(totalGhati);
  }

  // Angle on the ghati dial for an arbitrary moment, used by the renderer to
  // place segments from every ring against this same scale.
  function angleForTime(date, anchors) {
    return current(date, anchors).angleDeg;
  }

  VedicEngine.Ghati = {
    FIXED_SECONDS_PER_GHATI,
    current,
    currentRescaled,
    angleForTime,
  };
})(typeof window !== "undefined" ? window : globalThis);
