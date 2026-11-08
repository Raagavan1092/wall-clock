// Sūrya Siddhānta (SS) planetary positions: Sun, Moon, Mars, Mercury, Jupiter,
// Venus, Saturn and the lunar node (Rāhu/Ketu), as SIDEREAL longitudes.
//
// This is the classical computed (gaṇita) method, as opposed to the modern
// observational/numerical one used by sidereal.js:
//   1. ahargaṇa      days elapsed since the epoch (Kali-yuga start, Ujjain midnight)
//   2. madhyama      mean longitude = revolutions-per-mahayuga x elapsed days
//   3. manda-saṃskāra   equation of centre, epicycle whose size varies with the anomaly
//   4. śīghra-saṃskāra  equation of conjunction (Mars..Saturn only), same style of epicycle
//   5. the 4-step manda/śīghra/manda/śīghra sequence for the five star-planets
//   6. bīja-saṃskāra optional per-body correction added to the mean element (table below)
//
// SS gives sidereal longitudes directly, so NO ayanāṃśa is involved here. To
// compare with the rest of the engine (which is tropical minus ayanāṃśa), use
// Sidereal-style longitudes: tropical - Ayanamsa.get(name, date).
//
// PROVENANCE / CAVEATS (read before trusting to the arc-minute):
//  - The constants below are the standard SS values (Burgess/Whitney
//    translations). They were entered from memory because the reference sites
//    were unreachable when this was written, then sanity-checked numerically
//    against the modern ephemeris (test/run-web-tests.js, section 4). That check
//    already caught one wrong constant (Mercury) and the wrong creation-to-Kali
//    count. It is a coarse check: SS itself drifts from the real sky (today
//    roughly Sun/Moon/Rāhu <4°, Jupiter/Saturn ~6°, and more for Mars, Mercury
//    and Venus near conjunction), which is exactly what bīja corrects. So verify
//    against the actual almanac before relying on arc-minutes.
//  - Order of the manda/śīghra steps for the five star-planets could not be
//    checked against the verses; the plausible orderings agree to within a
//    couple of degrees, so the choice is documented at starPlanet().
//  - The BIJA table is deliberately EMPTY: bīja values and their epoch differ by
//    school (Vākya, Parahita, Rashtriya...) and must come from the text the
//    department follows. With it empty, results are pure Sūrya Siddhānta.
//  - Positions are for the instant, not for a local sunrise: SS's deśāntara /
//    bhujāntara / cara corrections convert a local-time ahargaṇa; since this
//    takes an absolute instant (UTC) they are not needed here.
(function (global) {
  "use strict";

  const VedicEngine = global.VedicEngine = global.VedicEngine || {};
  const Util = VedicEngine.Util;

  // ---- Epoch ---------------------------------------------------------------
  // Kali-yuga start: midnight (Ujjain) opening 18 Feb 3102 BCE (Julian), JD 588465.5.
  const KALI_EPOCH_JD = 588465.5;
  const UJJAIN_LONGITUDE_DEG = 75.76667; // 75°46' E; Ujjain mean time = UT + lon/360 days
  // Years from Creation to the Kali epoch: 1,955,880,000 (the count behind the
  // "Sṛṣṭyabda" printed in panchāṅgas) = 452.75 mahayugas of 4,320,000 years. Only
  // the fraction (0.75 = 1811/4 - 452) matters, since every body makes a whole
  // number of revolutions per mahayuga. Effect: all the mean planets start at 0°
  // at the Kali epoch (their revolution counts are multiples of 4), while the
  // Moon's node starts at 180° and the apsides at their own offsets.
  // (The other traditional count, 1,972,944,000, was tried and puts the Moon ~80°
  // off the real sky; this one lands within a few degrees. See the tests.)
  const KALI_FRACTION_NUM = 1811n;  // years-from-creation / 4,320,000 = 1811 / 4
  const KALI_FRACTION_DEN = 4n;

  // Civil days in a mahayuga (4,320,000 years).
  const CIVIL_DAYS_PER_MAHAYUGA = 1577917828n;

  // ---- Revolutions per mahayuga (BigInt: exactness matters, products reach 1e17) ----
  const REVS = {
    sun: 4320000n,
    moon: 57753336n,
    mars: 2296832n,
    mercurySighra: 17937060n,
    jupiter: 364220n,
    venusSighra: 7022376n,
    saturn: 146568n,
    // Apsides (mandocca): where each body's epicycle-of-the-centre is "farthest".
    moonApogee: 488203n,
    sunApogee: 387n,
    marsApogee: 204n,
    mercuryApogee: 368n,
    jupiterApogee: 900n,
    venusApogee: 535n,
    saturnApogee: 39n,
    // Moon's ascending node (Rāhu) moves backwards.
    moonNode: -232238n,
  };

  // ---- Epicycle circumferences, in degrees out of 360 ---------------------
  // [at the end of an "even" quadrant (anomaly 0°/180°), at the end of an "odd"
  // quadrant (90°/270°)]. The epicycle shrinks smoothly between the two with |sin|.
  const MANDA_EPICYCLE = {
    sun: [14, 13 + 40 / 60],
    moon: [32, 31 + 40 / 60],
    mars: [75, 72],
    mercury: [30, 28],
    jupiter: [33, 32],
    venus: [12, 11],
    saturn: [49, 48],
  };
  const SIGHRA_EPICYCLE = {
    mars: [235, 232],
    mercury: [133, 132],
    jupiter: [70, 72],
    venus: [262, 260],
    saturn: [39, 40],
  };

  // ---- Sine table ----------------------------------------------------------
  // SS Rsines (R = 3438') at 3°45' steps, 0..90°. Used with linear interpolation,
  // as the text prescribes. opts.exactSine switches to Math.sin for comparison.
  const R = 3438;
  const SINE_TABLE = [0, 225, 449, 671, 889, 1105, 1315, 1520, 1719, 1910, 2093, 2267,
    2431, 2585, 2728, 2859, 2978, 3084, 3177, 3256, 3321, 3372, 3409, 3431, 3438];
  const STEP_DEG = 3.75;

  // Sine of `deg` as a unit-radius value in [-1, 1].
  function sinSS(deg, exact) {
    if (exact) return Math.sin(deg * Math.PI / 180);
    const x = Util.normDeg(deg);
    let sign = 1, y = x;
    if (x >= 180) { sign = -1; y = x - 180; }
    if (y > 90) y = 180 - y;
    const i = Math.min(Math.floor(y / STEP_DEG), 23);
    const frac = (y - i * STEP_DEG) / STEP_DEG;
    return sign * (SINE_TABLE[i] + (SINE_TABLE[i + 1] - SINE_TABLE[i]) * frac) / R;
  }

  function cosSS(deg, exact) { return sinSS(deg + 90, exact); }

  // Inverse of the above: arc (degrees, in [-90, 90]) whose sine is `v`.
  function arcsinSS(v, exact) {
    if (exact) return Math.asin(Math.max(-1, Math.min(1, v))) * 180 / Math.PI;
    const sign = v < 0 ? -1 : 1;
    const t = Math.min(Math.abs(v), 1) * R;
    let i = 0;
    while (i < 23 && t > SINE_TABLE[i + 1]) i++;
    const frac = (t - SINE_TABLE[i]) / (SINE_TABLE[i + 1] - SINE_TABLE[i]);
    return sign * (i + frac) * STEP_DEG;
  }

  // ---- Bīja table (EMPTY on purpose) --------------------------------------
  // Keyed by body: sun, moon, mars, mercury, jupiter, venus, saturn, rahu.
  // Each entry is either
  //   { epochYear, constantArcmin, arcminPerYear }   (years are Gregorian decimal years;
  //       correction = constantArcmin + arcminPerYear * (year - epochYear)), or
  //   a function (jd, ctx) => correction in degrees, for tables that do not fit that shape.
  // The correction is added to the body's own mean element before the saṃskāras:
  // the mean longitude for Sun/Moon/Mars/Jupiter/Saturn/Rāhu, and the śīghrocca for
  // Mercury and Venus (their "own" revolution count in SS). Positive = forward.
  const BIJA = {};

  function setBija(body, entry) {
    if (entry == null) delete BIJA[body]; else BIJA[body] = entry;
  }

  function clearBija() {
    Object.keys(BIJA).forEach(function (k) { delete BIJA[k]; });
  }

  function bijaDegrees(body, jd) {
    const e = BIJA[body];
    if (!e) return 0;
    if (typeof e === "function") return e(jd, { body: body });
    const year = 2000 + (jd - 2451545.0) / 365.25;
    return ((e.constantArcmin || 0) + (e.arcminPerYear || 0) * (year - (e.epochYear || 2000))) / 60;
  }

  // ---- Mean positions ------------------------------------------------------
  function julianDayUTC(date) { return date.getTime() / 86400000 + 2440587.5; }

  // Days since the Kali epoch at Ujjain mean time (the SS "ahargaṇa", fractional).
  function ahargana(date) {
    return julianDayUTC(date) + UJJAIN_LONGITUDE_DEG / 360 - KALI_EPOCH_JD;
  }

  // Longitude (degrees, [0,360)) of an element that makes `revs` revolutions per
  // mahayuga, `days` after the Kali epoch.
  function revolve(revs, days) {
    // Position at the Kali epoch: frac(revs * 452.75), exactly.
    const atEpoch = Number(((revs * KALI_FRACTION_NUM) % KALI_FRACTION_DEN + KALI_FRACTION_DEN) % KALI_FRACTION_DEN) / Number(KALI_FRACTION_DEN);
    // Whole days exactly (BigInt), the fractional day in floating point.
    const whole = Math.floor(days);
    const part = days - whole;
    const D = CIVIL_DAYS_PER_MAHAYUGA;
    const n = (revs * BigInt(whole)) % D;
    const wholeFrac = Number((n + D) % D) / Number(D);
    const partFrac = (Number(revs) * part / Number(D)) % 1;
    return Util.normDeg(((atEpoch + wholeFrac + partFrac) % 1) * 360);
  }

  const BODIES = ["sun", "moon", "mars", "mercury", "jupiter", "venus", "saturn", "rahu"];

  // The revolution counts for each body: its mean element, optional śīghrocca
  // and mandocca.
  const ELEMENTS = {
    sun: { mean: REVS.sun, apogee: REVS.sunApogee },
    moon: { mean: REVS.moon, apogee: REVS.moonApogee },
    mars: { mean: REVS.mars, sighrocca: REVS.sun, apogee: REVS.marsApogee },
    mercury: { mean: REVS.sun, sighrocca: REVS.mercurySighra, apogee: REVS.mercuryApogee },
    jupiter: { mean: REVS.jupiter, sighrocca: REVS.sun, apogee: REVS.jupiterApogee },
    venus: { mean: REVS.sun, sighrocca: REVS.venusSighra, apogee: REVS.venusApogee },
    saturn: { mean: REVS.saturn, sighrocca: REVS.sun, apogee: REVS.saturnApogee },
    rahu: { mean: REVS.moonNode },
  };

  function checkBody(body) {
    if (!ELEMENTS[body]) throw new Error("Unknown body '" + body + "'. Available: " + BODIES.join(", ") + ", ketu");
  }

  // Mean elements for a body at `date` (all degrees, with any bīja applied).
  function elements(body, date) {
    checkBody(body);
    const days = ahargana(date);
    const jd = julianDayUTC(date);
    const el = ELEMENTS[body];
    const bija = bijaDegrees(body, jd);
    const out = { days: days, bija: bija };
    if (body === "mercury" || body === "venus") {
      // Mean = Sun's mean; the body's own motion is its śīghrocca.
      out.mean = revolve(el.mean, days);
      out.sighrocca = Util.normDeg(revolve(el.sighrocca, days) + bija);
    } else {
      out.mean = Util.normDeg(revolve(el.mean, days) + bija);
      if (el.sighrocca) out.sighrocca = revolve(el.sighrocca, days);
    }
    if (el.apogee) out.apogee = revolve(el.apogee, days);
    return out;
  }

  function meanLongitude(body, date) {
    if (body === "ketu") return Util.normDeg(meanLongitude("rahu", date) + 180);
    const e = elements(body, date);
    // For Mercury/Venus the "own" mean position is the śīghrocca.
    return (body === "mercury" || body === "venus") ? e.sighrocca : e.mean;
  }

  // ---- Saṃskāras -----------------------------------------------------------
  // Epicycle circumference (degrees of 360) at a given anomaly.
  function epicycle(pair, anomalyDeg, exact) {
    return pair[0] - (pair[0] - pair[1]) * Math.abs(sinSS(anomalyDeg, exact));
  }

  // Manda equation (degrees) for a body whose planet sits at `longitude`.
  // Anomaly = longitude - apogee. Applied as: true = longitude - equation.
  function mandaEquation(body, longitude, apogee, exact) {
    const anomaly = longitude - apogee;
    const c = epicycle(MANDA_EPICYCLE[body], anomaly, exact);
    return arcsinSS(c / 360 * sinSS(anomaly, exact), exact);
  }

  // Śīghra equation (degrees): added to the longitude. Anomaly = śīghrocca - longitude.
  function sighraEquation(body, longitude, sighrocca, exact) {
    const anomaly = sighrocca - longitude;
    const r = epicycle(SIGHRA_EPICYCLE[body], anomaly, exact) / 360;
    const sinA = sinSS(anomaly, exact), cosA = cosSS(anomaly, exact);
    const hyp = Math.sqrt((1 + r * cosA) * (1 + r * cosA) + (r * sinA) * (r * sinA));
    return arcsinSS(r * sinA / hyp, exact);
  }

  // ---- True positions ------------------------------------------------------
  // Sidereal longitude in degrees [0,360) at `date`.
  // opts.exactSine: use Math.sin/asin instead of the SS sine table (default false).
  // opts.applyBija: include the bīja table (default true; it is empty today).
  function trueLongitude(body, date, opts) {
    opts = opts || {};
    const exact = !!opts.exactSine;
    if (body === "ketu") return Util.normDeg(trueLongitude("rahu", date, opts) + 180);
    if (body === "rahu") return meanLongitude("rahu", date); // SS has only the mean node
    const saved = opts.applyBija === false ? stashBija() : null;
    try {
      const e = elements(body, date);
      if (body === "sun" || body === "moon") {
        return Util.normDeg(e.mean - mandaEquation(body, e.mean, e.apogee, exact));
      }
      return starPlanet(body, e, exact);
    } finally {
      if (saved) restoreBija(saved);
    }
  }

  // Mars, Mercury, Jupiter, Venus, Saturn: manda / śīghra / manda / śīghra.
  //   P1 = mean - half of manda(mean)
  //   P2 = P1 + sighra(P1)
  //   P3 = mean - whole manda(P2)         (manda re-derived from the corrected planet)
  //   true = P3 + sighra(P3)
  function starPlanet(body, e, exact) {
    // Mercury/Venus: the "mean" fed to manda is the Sun's mean; the śīghra then
    // supplies the planet's own motion.
    const mean = e.mean;
    const p1 = mean - mandaEquation(body, mean, e.apogee, exact) / 2;
    const p2 = p1 + sighraEquation(body, p1, e.sighrocca, exact);
    const p3 = mean - mandaEquation(body, p2, e.apogee, exact);
    return Util.normDeg(p3 + sighraEquation(body, p3, e.sighrocca, exact));
  }

  function stashBija() {
    const copy = Object.assign({}, BIJA);
    clearBija();
    return copy;
  }

  function restoreBija(copy) { clearBija(); Object.assign(BIJA, copy); }

  // Every body at once: { sun, moon, mars, mercury, jupiter, venus, saturn, rahu, ketu }.
  function positions(date, opts) {
    const out = {};
    BODIES.forEach(function (b) { out[b] = trueLongitude(b, date, opts); });
    out.ketu = Util.normDeg(out.rahu + 180);
    return out;
  }

  VedicEngine.SuryaSiddhanta = {
    BODIES: BODIES.concat(["ketu"]),
    KALI_EPOCH_JD: KALI_EPOCH_JD,
    ahargana: ahargana,
    elements: elements,
    meanLongitude: meanLongitude,
    trueLongitude: trueLongitude,
    positions: positions,
    bija: { table: BIJA, set: setBija, clear: clearBija, degrees: bijaDegrees },
    _internals: { sinSS: sinSS, arcsinSS: arcsinSS, revolve: revolve, mandaEquation: mandaEquation, sighraEquation: sighraEquation },
  };
})(typeof window !== "undefined" ? window : globalThis);
