// Amanta (South Indian / Karnataka) lunar month - the convention Sringeri
// itself uses, as opposed to the North Indian Purnimanta convention (whose
// month names run about half a month "ahead" during Krishna Paksha, since
// Purnimanta months run full-moon-to-full-moon while Amanta runs new-moon-
// to-new-moon). Only Amanta is implemented here, per the tithi-tooltip
// request that prompted this module - Purnimanta is not computed.
//
// Algorithm, verified against drikpanchang.com (2026-10-29 -> Amanta
// Bhadrapada; confirmed to be Ashwina there, which only the "next new moon"
// rule below reproduces - the more intuitive-sounding "last new moon" rule
// was tried first and gave the wrong month, one rashi short): a lunar month
// is named after the sidereal solar rashi (0=Mesha..11=Meena) the Sun
// occupies at the NEXT new moon (the instant this lunar month ENDS). In a
// normal month, exactly one sankranti (the Sun crossing into a new rashi)
// falls between the previous and next new moon, and the month is named
// after whichever rashi that sankranti transitions INTO - which is the
// rashi still active at the next new moon, since the sankranti always
// precedes it. KNOWN LIMITATION: this does not detect adhika (leap) or
// kshaya (expunged) months, where zero or two sankranti fall within one
// lunar month - those are rare (roughly once every 32 months) and are not
// specially labelled here; flagged rather than silently mislabelled.
(function (global) {
  "use strict";

  const VedicEngine = global.VedicEngine = global.VedicEngine || {};
  const Astronomy = global.Astronomy;
  if (!Astronomy) {
    throw new Error("masa.js must be loaded after js/vendor/astronomy.browser.js");
  }
  const Sidereal = VedicEngine.Sidereal;
  const Ayanamsa = VedicEngine.Ayanamsa;
  const Util = VedicEngine.Util;

  // rashiIndex: 0=Mesha, 1=Vrishabha, ... 11=Meena. Callers resolve this to
  // a name via panchanga-data.json's amantaMasa.names (engine stays data-free).
  function amantaMasaForDate(date, ayanamsaName) {
    const nextNewMoon = Astronomy.SearchMoonPhase(0, date, 40);
    if (!nextNewMoon) {
      throw new Error("Could not find an upcoming new moon within 40 days of " + date.toISOString());
    }
    const ayanamsaDeg = Ayanamsa.get(ayanamsaName, nextNewMoon.date);
    const sunSidereal = Sidereal.siderealSunLongitude(nextNewMoon.date, ayanamsaDeg);
    const rashiIndex = Math.floor(Util.normDeg(sunSidereal) / 30);
    return { rashiIndex, nextNewMoon: nextNewMoon.date };
  }

  VedicEngine.Masa = { amantaMasaForDate };
})(typeof window !== "undefined" ? window : globalThis);
