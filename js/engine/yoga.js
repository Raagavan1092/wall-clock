// Yoga: sum of sidereal Sun and Moon longitudes, divided into 27 equal spans of
// 13 deg 20' (360/27) each, same span size as nakshatra but a different quantity.
// Depends on the ayanamsa setting (the ayanamsa offset does NOT cancel here,
// since it's a sum of two longitudes rather than a difference).
(function (global) {
  "use strict";

  const VedicEngine = global.VedicEngine = global.VedicEngine || {};
  const Util = VedicEngine.Util;
  const Sidereal = VedicEngine.Sidereal;
  const Ayanamsa = VedicEngine.Ayanamsa;

  const SPAN = 360 / 27;

  function current(date, ayanamsaName) {
    function yogaAngle(d) {
      const ay = Ayanamsa.get(ayanamsaName, d);
      return Util.normDeg(Sidereal.siderealSunLongitude(d, ay) + Sidereal.siderealMoonLongitude(d, ay));
    }

    const value = yogaAngle(date);
    const index = Math.floor(value / SPAN); // 0..26
    const startDeg = index * SPAN;
    const endDeg = ((index + 1) % 27) * SPAN;

    const endTime = Util.findAngleCrossing(yogaAngle, date, endDeg, { direction: 1, stepMinutes: 20, maxDays: 2 });
    const startTime = Util.findAngleCrossing(yogaAngle, date, startDeg, { direction: -1, stepMinutes: 20, maxDays: 2 });

    if (!endTime || !startTime) {
      throw new Error("Failed to bracket current yoga boundary within the search window.");
    }

    const totalMs = endTime.getTime() - startTime.getTime();
    const progress = totalMs > 0 ? (date.getTime() - startTime.getTime()) / totalMs : 0;

    return { index, startTime, endTime, progress };
  }

  VedicEngine.Yoga = { current, SPAN };
})(typeof window !== "undefined" ? window : globalThis);
