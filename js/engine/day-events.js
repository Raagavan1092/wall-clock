// Point-in-time events within one Vedic day (governingSunrise..nextSunrise),
// for the dial's marker lines alongside Āvartana/Niśītha:
//  - Candrodaya / Candrāsta: moonrise and moonset. Upper limb with
//    refraction (astronomy-engine's SearchRiseSet), the same convention as
//    the default sunrise. The Moon rises ~50 min later each day, so a given
//    Vedic day can have no moonrise or no moonset at all - then that marker
//    is simply absent.
//  - Saṅkrānti: the instant the sidereal Sun enters a new rāśi, only on the
//    one day a month it happens.
(function (global) {
  "use strict";

  const VedicEngine = global.VedicEngine = global.VedicEngine || {};
  const Astronomy = global.Astronomy;
  const Util = VedicEngine.Util;
  const Sidereal = VedicEngine.Sidereal;
  const Ayanamsa = VedicEngine.Ayanamsa;

  function moonEvent(location, direction, from, until) {
    const observer = new Astronomy.Observer(location.latitude, location.longitude, location.elevation || 0);
    const limitDays = (until.getTime() - from.getTime()) / 86400000;
    const result = Astronomy.SearchRiseSet(Astronomy.Body.Moon, observer, direction, from, limitDays);
    return result && result.date < until ? result.date : null;
  }

  // { moonrise: Date|null, moonset: Date|null, sankranti: { time, rashiIndex }|null }
  function compute(anchors, location, ayanamsaName) {
    const start = anchors.governingSunrise, end = anchors.nextSunrise;

    function sunAngle(d) { return Sidereal.siderealSunLongitude(d, Ayanamsa.get(ayanamsaName, d)); }
    const rashiAtStart = Math.floor(sunAngle(start) / 30);
    const rashiAtEnd = Math.floor(sunAngle(end) / 30);
    let sankranti = null;
    if (rashiAtEnd !== rashiAtStart) {
      const time = Util.findAngleCrossing(sunAngle, start, rashiAtEnd * 30, { direction: 1, stepMinutes: 60, maxDays: 1.1 });
      if (time && time < end) sankranti = { time: time, rashiIndex: rashiAtEnd };
    }

    return {
      moonrise: moonEvent(location, +1, start, end),
      moonset: moonEvent(location, -1, start, end),
      sankranti: sankranti,
    };
  }

  VedicEngine.DayEvents = { compute };
})(typeof window !== "undefined" ? window : globalThis);
