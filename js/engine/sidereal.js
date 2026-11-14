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
  //   "ss-ranganatha" Ranganatha Daivajna's updated rules (bija). For now this is the
  //                   Makaranda sarini: SS with Makaranda's mean motions (surya-siddhanta.js,
  //                   opts.school = "makaranda").
  //   "vakya"         Vakyakarana rules (Aryabhatiya-based), vakya.js
  //   "ketkar"        Venkatesh Ketkar's Ketaki Grahaganita, ketaki.js
  // All but "drik" give sidereal longitudes directly, so the ayanamsa setting does not enter.
  // A method that is listed in Settings but has no rules yet goes in PENDING_METHODS, not
  // METHODS: it must not appear to work before its rules are actually implemented (silently
  // falling back to another method would be a wrong answer that looks right).
  // Sources for the three classical additions: docs/graha-sphuta-sources.md.
  // Sunrise/sunset, moonrise/moonset and the lagna always use the modern ephemeris.
  const METHODS = ["drik", "ss", "ss-ranganatha", "vakya", "ketkar"];
  const PENDING_METHODS = [];

  // True when Sun and Moon positions come from a formula engine rather than the library,
  // so tithi/karana/month must be found by crossing searches on our own longitudes.
  function usesFormula(method) { return METHODS.indexOf(method) > 0; }

  // Sidereal longitude (degrees) of "sun" or "moon" under the given method.
  function longitude(body, date, ayanamsaName, method) {
    if (method === "ss") {
      // applyBija:false = pure Surya Siddhanta whatever the (empty-by-default) bija table holds.
      return VedicEngine.SuryaSiddhanta.trueLongitude(body, date, { applyBija: false });
    }
    if (method === "ss-ranganatha") return VedicEngine.SuryaSiddhanta.trueLongitude(body, date, { school: "makaranda" });
    if (method === "vakya") return VedicEngine.Vakya.trueLongitude(body, date);
    if (method === "ketkar") return VedicEngine.Ketaki.trueLongitude(body, date);
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
