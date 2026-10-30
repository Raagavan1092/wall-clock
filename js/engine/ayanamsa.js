// Ayanamsa (precession offset between the tropical and sidereal zodiacs).
//
// CONTESTED / APPROXIMATE: astronomy-engine has no built-in ayanamsa. Lahiri
// (Chitrapaksha) ayanamsa is not a closed-form astronomical quantity but a
// precession-offset convention defined by the Indian Calendar Reform Committee
// (1956) and refined since; different ephemeris packages (Swiss Ephemeris's
// SE_SIDM_LAHIRI, N.C. Lahiri's original tables, drikpanchang.com's own
// implementation, etc.) agree to within a few arcseconds but not exactly.
//
// The formula below is the standard IAU precession polynomial anchored to the
// commonly-published Lahiri value at J2000.0 (23°51'25.53"), then shifted by a
// constant +24.2" calibration term. That offset was measured empirically, not
// guessed: test/test-harness.html compares this function's output against the
// "Lahiri Ayanamsha" value drikpanchang.com publishes for Sringeri, and the raw
// (uncalibrated) formula was consistently low by 24.1-24.3" across all 11 dates
// spanning 2026 used in that harness - a near-constant gap (not a growing one),
// meaning the precession *rate* already matches drikpanchang's convention well
// and only the epoch constant needed adjusting. After this shift the harness
// shows sub-arcsecond residuals on all 11 dates. This calibrates to ONE
// specific, widely-used Lahiri implementation (drikpanchang's); other sources
// (e.g. raw Swiss Ephemeris SE_SIDM_LAHIRI) may still differ by a few
// arcseconds, which is why this is documented as a calibration choice rather
// than asserted as "the" exact Lahiri value.
(function (global) {
  "use strict";

  const VedicEngine = global.VedicEngine = global.VedicEngine || {};
  const JD_J2000 = 2451545.0;
  const JULIAN_CENTURY_DAYS = 36525.0;

  function julianDayUTC(date) {
    return date.getTime() / 86400000 + 2440587.5;
  }

  // Lahiri (Chitrapaksha) ayanamsa in degrees at the given Date (UTC).
  function lahiri(date) {
    const T = (julianDayUTC(date) - JD_J2000) / JULIAN_CENTURY_DAYS;
    // 85885.53" = 23deg 51' 25.53" (the published J2000 Lahiri value), +24.2" =
    // empirical calibration against drikpanchang.com - see file header comment.
    const arcsec = (85885.53 + 24.2) + 5028.796195 * T + 1.1054348 * T * T + 0.00007964 * T * T * T;
    return arcsec / 3600.0;
  }

  // Pluggable registry so other ayanamsas (Raman, KP/Krishnamurti, True
  // Chitrapaksha) can be added later without touching call sites. Only Lahiri
  // is implemented for this prototype; the others are left as explicit
  // "not implemented" stubs rather than silently falling back to Lahiri.
  const registry = {
    lahiri: lahiri,
  };

  function get(name, date) {
    const fn = registry[name];
    if (!fn) {
      throw new Error("Ayanamsa '" + name + "' is not implemented. Available: " + Object.keys(registry).join(", "));
    }
    return fn(date);
  }

  VedicEngine.Ayanamsa = {
    lahiri,
    get,
    registry,
  };
})(typeof window !== "undefined" ? window : globalThis);
