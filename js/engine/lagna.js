// Lagna: the sidereal rashi rising on the eastern horizon (the ascendant),
// for the observer's latitude/longitude. Advances through all 12 rashis in
// a sidereal day, unevenly - signs of short ascension rise in well under 2
// hours, signs of long ascension take well over.
//
// Tropical ascendant from the local sidereal time (RAMC), the true obliquity
// of the ecliptic and the latitude, by the standard formula
//   asc = atan2(cos RAMC, -(sin RAMC cos e + tan lat sin e)),
// then shifted to sidereal by the ayanamsa setting, same as every other
// sidereal quantity in the engine.
(function (global) {
  "use strict";

  const VedicEngine = global.VedicEngine = global.VedicEngine || {};
  const Astronomy = global.Astronomy;
  const Util = VedicEngine.Util;
  const Ayanamsa = VedicEngine.Ayanamsa;

  const DEG = Math.PI / 180;
  const SPAN = 30;

  function tropicalAscendant(date, location) {
    const time = Astronomy.MakeTime(date);
    const ramc = Util.normDeg(Astronomy.SiderealTime(time) * 15 + location.longitude) * DEG;
    const eps = Astronomy.e_tilt(time).tobl * DEG;
    const lat = location.latitude * DEG;
    const asc = Math.atan2(Math.cos(ramc), -(Math.sin(ramc) * Math.cos(eps) + Math.tan(lat) * Math.sin(eps)));
    return Util.normDeg(asc / DEG);
  }

  function siderealAscendant(date, location, ayanamsaName) {
    return Util.normDeg(tropicalAscendant(date, location) - Ayanamsa.get(ayanamsaName, date));
  }

  // { index (0=Mesha..11=Meena), startTime, endTime } for the lagna at `date`.
  function current(date, location, ayanamsaName) {
    function angle(d) { return siderealAscendant(d, location, ayanamsaName); }
    const value = angle(date);
    const index = Math.floor(value / SPAN);
    const endTime = Util.findAngleCrossing(angle, date, ((index + 1) % 12) * SPAN, { direction: 1, stepMinutes: 10, maxDays: 0.5 });
    const startTime = Util.findAngleCrossing(angle, date, index * SPAN, { direction: -1, stepMinutes: 10, maxDays: 0.5 });
    if (!endTime || !startTime) {
      throw new Error("Failed to bracket the current lagna boundary within the search window.");
    }
    return { index, startTime, endTime };
  }

  VedicEngine.Lagna = { current, siderealAscendant, tropicalAscendant };
})(typeof window !== "undefined" ? window : globalThis);
