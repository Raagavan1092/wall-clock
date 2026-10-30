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

  VedicEngine.Sidereal = {
    tropicalSunLongitude,
    tropicalMoonLongitude,
    siderealSunLongitude,
    siderealMoonLongitude,
  };
})(typeof window !== "undefined" ? window : globalThis);
