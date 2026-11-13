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
// PROVENANCE (checked against the primary text):
//  - Source: Ebenezer Burgess's translation with Whitney's notes (Journal of the
//    American Oriental Society vol. 6, 1860; archive.org id dli.bengal.10689.17955).
//    Verified there: the revolution counts (i.29-33, 41-44), the civil days in a
//    mahayuga, 1,955,880,000 years from creation to the Kali epoch (i.46-48), all
//    mean planets at 0 Aries at that epoch with the Moon's node at 0 Libra and its
//    apsis at 0 Cancer (i.57-58 and note), the sine table (ii.17-27), the epicycle
//    sizes (ii.34-37) and how they vary (ii.38), and the sign rules (ii.45).
//  - Burgess's worked table for 1 Jan 1860, midnight at Ujjain (ahargana 1,811,945)
//    is reproduced to the arcsecond for the mean places (see test/run-web-tests.js).
//  - The order of the four corrections for Mars..Saturn (ii.43-44) follows Burgess's
//    commentary, because the verse wording is ambiguous: half sighra, half manda,
//    whole manda (on the mean place), whole sighra.
//  - Not reproduced from the text: Burgess's final "true place" example table has
//    unreadable OCR, so the true longitudes are checked against the modern ephemeris
//    only (coarse bounds). SS itself drifts from the real sky (Burgess notes up to
//    ~9 deg in his day), which is what bija corrects.
//  - The BIJA table is deliberately EMPTY: bija values and their epoch differ by
//    school (Vakya, Parahita, Rashtriya...) and must come from the text the
//    department follows. With it empty, results are pure Surya Siddhanta.
//    Bija can be entered as a table (see below) or, later, as a named rule-set.
//  - Positions are for the instant, not for a local sunrise: SS's desantara /
//    bhujantara / cara corrections convert a local-time ahargana; since this
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
  const KALI_FRACTION_NUM = 1811;  // years-from-creation / 4,320,000 = 1811 / 4
  const KALI_FRACTION_DEN = 4;

  // Civil days in a mahayuga (4,320,000 years).
  const CIVIL_DAYS_PER_MAHAYUGA = 1577917828;

  // ---- Revolutions per mahayuga (plain numbers are exact here: revs x whole days stays < 2^53) ----
  const REVS = {
    sun: 4320000,
    moon: 57753336,
    mars: 2296832,
    mercurySighra: 17937060,
    jupiter: 364220,
    venusSighra: 7022376,
    saturn: 146568,
    // Apsides (mandocca): where each body's epicycle-of-the-centre is "farthest".
    moonApogee: 488203,
    sunApogee: 387,
    marsApogee: 204,
    mercuryApogee: 368,
    jupiterApogee: 900,
    venusApogee: 535,
    saturnApogee: 39,
    // Moon's ascending node (Rāhu) moves backwards.
    moonNode: -232238,
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
  const SINE_TABLE = [0, 225, 449, 671, 890, 1105, 1315, 1520, 1719, 1910, 2093, 2267,
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
  // Keyed by body: sun, moon, mars, mercury, jupiter, venus, saturn, rahu, plus
  // moonApogee for the Moon's apsis. Each entry may combine either or both of:
  //   revsPerMahayuga: n        the classical form (as printed by Burgess): change the
  //                             body's revolution count per mahayuga by n, as the count is
  //                             printed in the text (use multiples of 4, as the tradition
  //                             does; for Rahu, retrograde, +n = faster backward). Acts over
  //                             the whole time since the Kali epoch.
  //   { epochYear, constantArcmin, arcminPerYear }   a linear correction in degrees:
  //                             constantArcmin + arcminPerYear * (year - epochYear).
  // or the entry can be a function (jd, ctx) => correction in degrees.
  // Corrections apply to the body's own mean element: the mean longitude for
  // Sun/Moon/Mars/Jupiter/Saturn/Rahu and the sighrocca for Mercury and Venus (their
  // "own" revolution count in SS). Positive = forward.
  const BIJA = {};

  function setBija(body, entry) {
    if (entry == null) delete BIJA[body]; else BIJA[body] = entry;
  }

  function clearBija() {
    Object.keys(BIJA).forEach(function (k) { delete BIJA[k]; });
  }

  // Named bija rule-sets, selectable per call with opts.bija = "<name>". EMPTY until a
  // school's table is supplied and checked (e.g. Ranganatha Daivajna's).
  const BIJA_PRESETS = {};
  Object.freeze(BIJA_PRESETS);

  // The table in force for a call: opts.bija (a preset name or a table object) if given,
  // else the global, user-editable BIJA table.
  function tableFor(opts) {
    const o = opts && opts.bija;
    if (!o) return BIJA;
    if (typeof o === "string") {
      if (!BIJA_PRESETS[o]) throw new Error("Unknown bija preset '" + o + "'. Available: " + Object.keys(BIJA_PRESETS).join(", "));
      return BIJA_PRESETS[o];
    }
    return o;
  }

  function bijaDegrees(body, jd, table) {
    const e = (table || BIJA)[body];
    if (!e) return 0;
    if (typeof e === "function") return e(jd, { body: body });
    if (e.constantArcmin == null && e.arcminPerYear == null) return 0;
    const year = 2000 + (jd - 2451545.0) / 365.25;
    return ((e.constantArcmin || 0) + (e.arcminPerYear || 0) * (year - (e.epochYear || 2000))) / 60;
  }

  function bijaRevs(body, table) {
    const e = (table || BIJA)[body];
    return (e && typeof e === "object" && e.revsPerMahayuga) ? +e.revsPerMahayuga : 0;
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
    const D = CIVIL_DAYS_PER_MAHAYUGA;
    // Position at the Kali epoch: frac(revs * 452.75), exactly.
    const atEpoch = (((revs * KALI_FRACTION_NUM) % KALI_FRACTION_DEN) + KALI_FRACTION_DEN) % KALI_FRACTION_DEN / KALI_FRACTION_DEN;
    // Whole days exactly, the fractional day separately (keeps full precision).
    const whole = Math.floor(days);
    const part = days - whole;
    const wholeFrac = ((((revs * whole) % D) + D) % D) / D;
    const partFrac = (revs * part / D) % 1;
    return Util.normDeg((((atEpoch + wholeFrac + partFrac) % 1) + 1) % 1 * 360);
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

  // Mean elements for a body at `date` (all degrees, with any bīja applied unless
  // opts.applyBija === false).
  function elements(body, date, opts) {
    checkBody(body);
    const useBija = !(opts && opts.applyBija === false);
    const table = tableFor(opts);
    const days = ahargana(date);
    const jd = julianDayUTC(date);
    const el = ELEMENTS[body];
    const bija = useBija ? bijaDegrees(body, jd, table) : 0;
    // The text gives the node's count as a magnitude (retrograde), so +n there means
    // faster backward motion; our stored count is negative, hence the sign flip.
    const dRevs = useBija ? (body === "rahu" ? -bijaRevs(body, table) : bijaRevs(body, table)) : 0;
    const out = { days: days, bija: bija };
    if (body === "mercury" || body === "venus") {
      // Mean = Sun's mean; the body's own motion is its sighrocca.
      out.mean = revolve(el.mean, days);
      out.sighrocca = Util.normDeg(revolve(el.sighrocca + dRevs, days) + bija);
    } else {
      out.mean = Util.normDeg(revolve(el.mean + dRevs, days) + bija);
      if (el.sighrocca) out.sighrocca = revolve(el.sighrocca, days);
    }
    if (el.apogee) {
      const apogeeRevs = body === "moon" && useBija ? el.apogee + bijaRevs("moonApogee", table) : el.apogee;
      out.apogee = revolve(apogeeRevs, days);
    }
    return out;
  }

  function meanLongitude(body, date, opts) {
    if (body === "ketu") return Util.normDeg(meanLongitude("rahu", date, opts) + 180);
    const e = elements(body, date, opts);
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
  // opts.applyBija: include bīja at all (default true; the global table is empty today).
  // opts.bija: a named rule-set (none exist yet) or a table object, used instead of the global table.
  function trueLongitude(body, date, opts) {
    opts = opts || {};
    const exact = !!opts.exactSine;
    if (body === "ketu") return Util.normDeg(trueLongitude("rahu", date, opts) + 180);
    if (body === "rahu") return meanLongitude("rahu", date, opts); // SS has only the mean node
    const e = elements(body, date, opts);
    if (body === "sun" || body === "moon") {
      // One equation only: the manda (equation of the apsis).
      return Util.normDeg(e.mean - mandaEquation(body, e.mean, e.apogee, exact));
    }
    return starPlanet(body, e, exact);
  }

  // Mars, Mercury, Jupiter, Venus, Saturn (ii.43-44, in Burgess's reading):
  //   L1   = mean + half sighra(mean)
  //   L2   = L1   + half manda(L1)
  //   L3   = mean + whole manda(L2)       (applied to the MEAN place)
  //   true = L3   + whole sighra(L3)
  // For Mercury and Venus the "mean" is the Sun's mean and the sighrocca is the body's
  // own revolution, exactly as in the text's worked tables.
  function starPlanet(body, e, exact) {
    const mean = e.mean;
    const l1 = mean + sighraEquation(body, mean, e.sighrocca, exact) / 2;
    const l2 = l1 - mandaEquation(body, l1, e.apogee, exact) / 2;
    const l3 = mean - mandaEquation(body, l2, e.apogee, exact);
    return Util.normDeg(l3 + sighraEquation(body, l3, e.sighrocca, exact));
  }

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
    bija: { table: BIJA, set: setBija, clear: clearBija, degrees: bijaDegrees, presets: BIJA_PRESETS },
    _internals: { sinSS: sinSS, arcsinSS: arcsinSS, revolve: revolve, mandaEquation: mandaEquation, sighraEquation: sighraEquation },
  };
})(typeof window !== "undefined" ? window : globalThis);
