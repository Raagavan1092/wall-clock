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
  // "drik"       modern ephemeris (astronomy-engine) minus the chosen ayanamsa. The default.
  // "ss-bentley" classical Surya Siddhanta with the historical (Bentley) bija, from
  //              surya-siddhanta.js. SS gives sidereal longitudes directly, so the
  //              ayanamsa setting does not enter.
  // Sunrise/sunset, moonrise/moonset and the lagna always use the modern ephemeris.
  const METHODS = ["drik", "ss-bentley"];

  function isSuryaSiddhanta(method) { return method === "ss-bentley"; }

  // Sidereal longitude (degrees) of "sun" or "moon" under the given method.
  function longitude(body, date, ayanamsaName, method) {
    if (method === "ss-bentley") {
      return VedicEngine.SuryaSiddhanta.trueLongitude(body, date, { bija: "bentley" });
    }
    const ay = VedicEngine.Ayanamsa.get(ayanamsaName, date);
    return body === "sun" ? siderealSunLongitude(date, ay) : siderealMoonLongitude(date, ay);
  }

  // Moon minus Sun, degrees [0,360): 0 = new moon, 180 = full moon. Ayanamsa cancels.
  function elongation(date, method) {
    return Util.normDeg(longitude("moon", date, "lahiri", method) - longitude("sun", date, "lahiri", method));
  }

  VedicEngine.Sidereal = {
    METHODS, isSuryaSiddhanta, longitude, elongation,
    tropicalSunLongitude,
    tropicalMoonLongitude,
    siderealSunLongitude,
    siderealMoonLongitude,
  };
})(typeof window !== "undefined" ? window : globalThis);
