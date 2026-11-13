// Sidereal (nirayana) longitudes of Sun and Moon, used by nakshatra/yoga/karana.
// Unlike tithi (a pure Moon-Sun elongation, which is ayanamsa-independent since
// the ayanamsa offset cancels in the difference), nakshatra and yoga genuinely
// depend on the ayanamsa setting.
(function (global) {
  "use strict";

  const VedicEngine = global.VedicEngine = global.VedicEngine || {};
  const Astronomy = global.Astronomy;
  if (!Astronomy) {
    throw new Error("sidereal.js must be loaded after js/vendor/astronomy.browser.js");
  }
  const Util = VedicEngine.Util;

  // Tropical (of-date) geocentric ecliptic longitude, in degrees [0, 360).
  function tropicalSunLongitude(date) {
    return Util.normDeg(Astronomy.SunPosition(date).elon);
  }

  function tropicalMoonLongitude(date) {
    return Util.normDeg(Astronomy.EclipticGeoMoon(date).lon);
  }

  function siderealSunLongitude(date, ayanamsaDeg) {
    return Util.normDeg(tropicalSunLongitude(date) - ayanamsaDeg);
  }

  function siderealMoonLongitude(date, ayanamsaDeg) {
    return Util.normDeg(tropicalMoonLongitude(date) - ayanamsaDeg);
  }

  // ---- Calculation methods ---------------------------------------------------
  // The five options the Jyotisha department asked for, in Settings order:
  //   "drik"          modern ephemeris (astronomy-engine) minus the chosen ayanamsa. Default.
  //   "ss"            plain Surya Siddhanta (surya-siddhanta.js), no corrections. Sidereal
  //                   directly, so the ayanamsa setting does not enter.
  //   "ss-ranganatha" Ranganatha Daivajna's updated rules (bija)      -- rules pending
  //   "vakya"         Vakyakarana rules (Aryabhatiya-based)           -- rules pending
  //   "ketkar"        Venkatesh Ketkar's rules (SS-based)             -- rules pending
  // The pending three are declared so Settings can list them, but they are NOT selectable
  // and NOT in METHODS: a method must not appear to work before its rules are actually
  // implemented (silently falling back to plain SS would be a wrong answer that looks right).
  // To add one: implement it, move its id from PENDING_METHODS to METHODS, and give
  // longitude() and usesFormula() a branch for it.
  // Sunrise/sunset, moonrise/moonset and the lagna always use the modern ephemeris.
  const METHODS = ["drik", "ss"];
  const PENDING_METHODS = ["ss-ranganatha", "vakya", "ketkar"];

  // True when Sun and Moon positions come from a formula engine rather than the library,
  // so tithi/karana/month must be found by crossing searches on our own longitudes.
  function usesFormula(method) { return method === "ss"; }

  // Sidereal longitude (degrees) of "sun" or "moon" under the given method.
  function longitude(body, date, ayanamsaName, method) {
    if (method === "ss") {
      // applyBija:false = pure Surya Siddhanta whatever the (empty-by-default) bija table holds.
      return VedicEngine.SuryaSiddhanta.trueLongitude(body, date, { applyBija: false });
    }
    const ay = VedicEngine.Ayanamsa.get(ayanamsaName, date);
    return body === "sun" ? siderealSunLongitude(date, ay) : siderealMoonLongitude(date, ay);
  }

  // Moon minus Sun, degrees [0,360): 0 = new moon, 180 = full moon. Ayanamsa cancels.
  function elongation(date, method) {
    return Util.normDeg(longitude("moon", date, "lahiri", method) - longitude("sun", date, "lahiri", method));
  }

  VedicEngine.Sidereal = {
    METHODS, PENDING_METHODS, usesFormula, longitude, elongation,
    tropicalSunLongitude,
    tropicalMoonLongitude,
    siderealSunLongitude,
    siderealMoonLongitude,
  };
})(typeof window !== "undefined" ? window : globalThis);
