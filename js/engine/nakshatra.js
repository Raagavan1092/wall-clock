// Nakshatra: sidereal Moon longitude divided into 27 equal spans of 13 deg 20'
// (360/27) each. Depends on the ayanamsa setting. No canned library search for
// sidereal-longitude crossings exists, so boundaries are found with the shared
// bisection search in util.js.
(function (global) {
  "use strict";

  const VedicEngine = global.VedicEngine = global.VedicEngine || {};
  const Util = VedicEngine.Util;
  const Sidereal = VedicEngine.Sidereal;
  const Ayanamsa = VedicEngine.Ayanamsa;

  const SPAN = 360 / 27;

  function current(date, ayanamsaName) {
    function siderealMoon(d) {
      return Sidereal.siderealMoonLongitude(d, Ayanamsa.get(ayanamsaName, d));
    }

    const lon = siderealMoon(date);
    const index = Math.floor(lon / SPAN); // 0..26
    const startDeg = index * SPAN;
    const endDeg = ((index + 1) % 27) * SPAN;

    const endTime = Util.findAngleCrossing(siderealMoon, date, endDeg, { direction: 1, stepMinutes: 20, maxDays: 2 });
    const startTime = Util.findAngleCrossing(siderealMoon, date, startDeg, { direction: -1, stepMinutes: 20, maxDays: 2 });

    if (!endTime || !startTime) {
      throw new Error("Failed to bracket current nakshatra boundary within the search window.");
    }

    const totalMs = endTime.getTime() - startTime.getTime();
    const progress = totalMs > 0 ? (date.getTime() - startTime.getTime()) / totalMs : 0;

    return { index, startTime, endTime, progress };
  }

  // Sun's sidereal nakshatra index only (no boundary search) - used as the
  // counting origin for Ravi Yoga. The Sun spends ~13.4 days per nakshatra,
  // so this is effectively constant across a single Vedic day; callers
  // compute it once (at governingSunrise) rather than per-segment.
  function sunIndex(date, ayanamsaName) {
    const lon = Sidereal.siderealSunLongitude(date, Ayanamsa.get(ayanamsaName, date));
    return Math.floor(lon / SPAN);
  }

  VedicEngine.Nakshatra = { current, sunIndex, SPAN };
})(typeof window !== "undefined" ? window : globalThis);
