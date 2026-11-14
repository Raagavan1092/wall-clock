// Ketakī Grahagaṇita (Veṅkaṭeśa Bāpūjī Ketkar): true Sun, Moon, Rāhu and the five planets
// as SIDEREAL (nirayana) longitudes, by the karaṇa's own constants and tables.
// Source notes with verse numbers and the worked example: docs/graha-sphuta-sources.md,
// section B.
//
//  - Epoch: Śaka 1800 Caitra śukla 1, Wednesday 3 April 1878, mean sunrise at Ujjain.
//  - Mean places, as the text does it: kṣepaka + (whole 6940-day cycles x dhruvaka) + the
//    motion for the remaining days by the karaṇa's own short rules (Madhyama 10-24).
//  - Secular (karṣa) corrections to Moon, Moon's apogee and Rāhu; the Jupiter-Saturn
//    great inequality.
//  - Sun: one manda equation (table at every 10 degrees).
//  - Moon: annual equation, cyuti (evection), tithi correction (variation), manda equation,
//    reduction to the ecliptic.
//  - Planets: mean places are heliocentric; manda equation, radius vector, then the
//    Sun-Earth-planet triangle for the geocentric place.
//  - Not applied: the corrections that move a place from Ujjain mean sunrise to LOCAL TRUE
//    sunrise (rekhāntara, cara, udayāntara and the equation-of-time part of bhujāntara).
//    They convert clock time; this engine takes an absolute instant. The other part of
//    Ketkar's Moon "bhujāntara" is the Moon's annual equation, a real inequality, and is kept.
//  - Not applied: Saturn's two extra small corrections (about 8', reading unverified) and
//    planetary latitudes.
(function (global) {
  "use strict";

  const VedicEngine = global.VedicEngine = global.VedicEngine || {};
  const Util = VedicEngine.Util;
  const RAD = Math.PI / 180;
  const sind = function (x) { return Math.sin(x * RAD); };
  const cosd = function (x) { return Math.cos(x * RAD); };
  const dms = function (s, d, m, sec) { return s * 30 + d + m / 60 + (sec || 0) / 3600; };

  const UJJAIN_LONGITUDE_DEG = 75.76667;
  // 3 April 1878, 06:00 Ujjain mean time, as a Julian day (UT).
  const EPOCH_JD = Date.UTC(1878, 3, 3) / 86400000 + 2440587.5 + 0.25 - UJJAIN_LONGITUDE_DEG / 360;
  const CYCLE_DAYS = 6940;
  const SIDEREAL_YEAR = 365.2563744;

  // Days since the epoch (the text's ahargaṇa plus 6940 per elapsed cycle, fractional).
  function ahargana(date) { return date.getTime() / 86400000 + 2440587.5 - EPOCH_JD; }

  // k: kṣepaka (degrees at the epoch). dh: dhruvaka, the motion in one 6940-day cycle less
  // whole circles (Rāhu, retrograde, is printed as the forward remainder). rate: degrees a
  // day for the days left over, the karaṇa's rule written out (e.g. Sun: "days less a 70th
  // in degrees, less a 158th in minutes").
  const MEAN = {
    sun: { k: dms(11, 19, 5), dh: dms(0, 0, 7, 38), rate: 1 - 1 / 70 - 1 / 158 / 60 },
    moon: { k: dms(11, 25, 17), dh: dms(0, 3, 55, 36), rate: 14 - 14 / 17 - 1 / 148 / 60 },
    moonApogee: { k: dms(10, 27, 22), dh: dms(1, 22, 52, 56), rate: 1 / 9 + 1 / 65 / 60 },
    rahu: { k: dms(9, 27, 37), dh: dms(11, 22, 13, 58), rate: -(1 / 19 + 1 / 46 / 60) },
    mars: { k: dms(2, 9, 12), dh: dms(1, 6, 47, 20), rate: 10 / 19 - 10 / 73 / 60 },
    mercury: { k: dms(1, 22, 30), dh: dms(10, 20, 49, 50), rate: 3 / 22 * 30 + 1 / 700 },
    jupiter: { k: dms(9, 5, 40), dh: dms(7, 6, 39, 12), rate: 1 / 12 - 1 / 69 / 60 },
    venus: { k: dms(6, 15, 28), dh: dms(10, 18, 47, 10), rate: 8 / 5 + 1 / 8 / 60 + 1 / 6 / 3600 },
    saturn: { k: dms(11, 8, 21), dh: dms(7, 22, 12, 37), rate: 1 / 30 + 1 / 132 / 60 },
  };
  // Apsides (ucca: the Sun's apogee, the planets' aphelia) at the epoch, and their forward
  // motion in arcseconds per cycle.
  const UCCA = {
    sun: { k: dms(2, 18, 41), perCycle: 225 },
    mars: { k: dms(4, 11, 41), perCycle: 321 },
    mercury: { k: dms(7, 23, 26), perCycle: 117 },
    jupiter: { k: dms(5, 20, 13), perCycle: 126 },
    venus: { k: dms(9, 17, 40), perCycle: 283 },
    saturn: { k: dms(8, 8, 27), perCycle: 303 },
  };

  function meanOf(key, days) {
    const e = MEAN[key];
    const cycles = Math.floor(days / CYCLE_DAYS);
    return Util.normDeg(e.k + ((cycles * e.dh) % 360) + ((e.rate * (days - cycles * CYCLE_DAYS)) % 360));
  }
  function uccaOf(key, days) { return Util.normDeg(UCCA[key].k + UCCA[key].perCycle / 3600 * days / CYCLE_DAYS); }

  // Linear interpolation in a table given at every `step` degrees from 0.
  function lookup(table, step, x) {
    const i = Math.min(Math.floor(x / step), table.length - 2);
    return table[i] + (table[i + 1] - table[i]) * (x - i * step) / step;
  }
  // Angle folded to 0..180, with sign -1 for the first half-circle and +1 for the second
  // (the text's rule for every manda-type equation: kendra 0-6 signs subtract, 6-12 add).
  function fold(k) { k = Util.normDeg(k); return k <= 180 ? { arc: k, sign: -1 } : { arc: 360 - k, sign: 1 }; }
  function bhuja(k) { k = Util.normDeg(k); return k <= 90 ? k : k <= 180 ? 180 - k : k <= 270 ? k - 180 : 360 - k; }

  // ---- Secular corrections -----------------------------------------------------
  // Madhyama 25-26: X = c^2 / 6 arcminutes, c = centuries from Śaka 1800.
  function karsaX(days) { const c = days / SIDEREAL_YEAR / 100; return c * c / 6 / 60; }

  // Madhyama 27-29: Jupiter-Saturn inequality, degrees to add to Jupiter (Saturn gets -2.5x).
  function jupiterKarsa(days) {
    const Y = days / SIDEREAL_YEAR + 319;                 // years from Śaka 1481
    const K = (((Y % 918) + 918) % 918) * 360 / 918;      // kendra: 2r/153 signs
    const u = bhuja(K) / 9;
    const P = u * (20 - u);                               // arcminutes x 5
    return (K <= 180 ? 1 : -1) * P / 5 / 60;
  }

  // ---- Sun ---------------------------------------------------------------------
  const SUN_MANDA = [0, 20, 39, 57, 73, 87, 99, 108, 113, 115, 114, 109, 101, 89, 75, 59, 40, 20, 0];   // arcmin

  function sunState(days) {
    const mean = meanOf("sun", days);
    const f = fold(mean - uccaOf("sun", days));
    const phala = f.sign * lookup(SUN_MANDA, 10, f.arc) / 60;   // signed, degrees
    return { mean: mean, phala: phala, lon: Util.normDeg(mean + phala) };
  }

  // ---- Moon --------------------------------------------------------------------
  // All at every 10 degrees of the argument 0..180, arcminutes.
  const MOON_CYUTI = [0, 13, 25, 37, 47, 56, 64, 69, 73, 74, 73, 70, 65, 57, 48, 38, 26, 13, 0];
  const MOON_TITHI = [0, 12, 22, 30, 34, 34, 29, 21, 10, -2, -14, -25, -33, -36, -36, -32, -24, -13, 0];
  const MOON_MANDA = [0, 61, 121, 178, 231, 277, 316, 347, 367, 378, 376, 363, 339, 303, 256, 201, 138, 70, 0];
  const MOON_PARINATI = [0, 2, 4, 6, 7, 7, 6, 4, 2, 0];   // by bhuja 0..90
  // The Moon's annual equation is -657" per 115.2' of the Sun's manda equation.
  const ANNUAL_PER_SUN_PHALA = 657 / (115.2 * 60);

  // True Moon from: the mean Moon already carrying the annual equation (and, in the book,
  // the sunrise corrections), the mean Sun, the Moon's apogee and Rāhu. Spaṣṭa 17-24.
  function moonFromMean(m1, meanSun, apogee, node) {
    const e = fold(m1 + apogee - 2 * meanSun);
    const cyuti = e.sign * lookup(MOON_CYUTI, 10, e.arc) / 60;
    const D = Util.normDeg(m1 - meanSun);
    const tithi = (D <= 180 ? lookup(MOON_TITHI, 10, D) : -lookup(MOON_TITHI, 10, 360 - D)) / 60;
    const m2 = m1 + cyuti + tithi;
    const k = fold(m2 - apogee);
    const m3 = m2 + k.sign * lookup(MOON_MANDA, 10, k.arc) / 60;       // in its own orbit
    const u = Util.normDeg(m3 - node);
    const odd = Math.floor(u / 90) % 2 === 0;                           // 1st or 3rd quadrant
    return Util.normDeg(m3 + (odd ? -1 : 1) * lookup(MOON_PARINATI, 10, bhuja(u)) / 60);
  }

  function rahu(days) { return Util.normDeg(meanOf("rahu", days) + 0.75 * karsaX(days)); }

  function moon(days) {
    const X = karsaX(days);
    const s = sunState(days);
    const m1 = meanOf("moon", days) + X - s.phala * ANNUAL_PER_SUN_PHALA;
    return moonFromMean(m1, s.mean, meanOf("moonApogee", days) - 4 * X, rahu(days));
  }

  // ---- Planets -----------------------------------------------------------------
  // Manda equation tables in units of 0.1 degree, by the kendra (from the aphelion) 0..180.
  const PLANET_MANDA = {
    mars: [0, 17, 33, 48, 63, 76, 87, 96, 103, 106, 107, 104, 98, 88, 75, 59, 41, 21, 0],
    jupiter: [0, 9, 18, 26, 34, 41, 46, 51, 54, 55, 55, 53, 49, 44, 37, 29, 20, 10, 0],
    saturn: [0, 10, 21, 30, 39, 47, 54, 59, 63, 64, 64, 62, 58, 52, 45, 34, 24, 12, 0],
  };
  // Mercury and Venus: the text's tables are not fully legible in the scan, so the series
  // the commentary gives for them is used (arcminutes; kendra g from the aphelion).
  const PLANET_SERIES = {
    mercury: [1406.2, 178.9, 31.5],
    venus: [47.3, 0.2, 0],
  };
  // Mean radius vector and kakṣā-cyuti (a x e), Sun-Earth = 100. A true radius vector is
  // used for Mars and Mercury only, as in the text.
  const ORBIT = {
    mars: { a: 152, ae: 14, trueR: true },
    mercury: { a: 39, ae: 8, trueR: true },
    jupiter: { a: 520 },
    venus: { a: 72 },
    saturn: { a: 954 },
  };

  // Heliocentric true longitude and radius vector.
  function heliocentric(body, days) {
    let mean = meanOf(body, days);
    if (body === "jupiter") mean += jupiterKarsa(days);
    if (body === "saturn") mean -= 2.5 * jupiterKarsa(days);
    const g = Util.normDeg(mean - uccaOf(body, days));
    const f = fold(g);
    let size;
    if (PLANET_MANDA[body]) size = lookup(PLANET_MANDA[body], 10, f.arc) / 10;
    else {
      const c = PLANET_SERIES[body];
      size = (c[0] * sind(f.arc) - c[1] * sind(2 * f.arc) + c[2] * sind(3 * f.arc)) / 60;
    }
    const phala = f.sign * size;
    const o = ORBIT[body];
    const r = o.trueR ? o.a + o.ae * cosd(g + phala / 2) : o.a;
    return { lon: Util.normDeg(mean + phala), r: r, phala: phala, mean: mean };
  }

  // Geocentric longitude from the heliocentric place and the true Sun (Earth-Sun = 100).
  function geocentric(helioLon, r, sunLon) {
    return Util.normDeg(Math.atan2(r * sind(helioLon) + 100 * sind(sunLon), r * cosd(helioLon) + 100 * cosd(sunLon)) / RAD);
  }

  const BODIES = ["sun", "moon", "mars", "mercury", "jupiter", "venus", "saturn", "rahu", "ketu"];

  // Sidereal longitude in degrees [0,360) at `date`.
  function trueLongitude(body, date) {
    const days = ahargana(date);
    if (body === "sun") return sunState(days).lon;
    if (body === "moon") return moon(days);
    if (body === "rahu") return rahu(days);
    if (body === "ketu") return Util.normDeg(rahu(days) + 180);
    if (!ORBIT[body]) throw new Error("Unknown body '" + body + "'. Available: " + BODIES.join(", "));
    const h = heliocentric(body, days);
    return geocentric(h.lon, h.r, sunState(days).lon);
  }

  function positions(date) {
    const out = {};
    BODIES.forEach(function (b) { out[b] = trueLongitude(b, date); });
    return out;
  }

  // Ketkar's ayanāṁśa (Spaṣṭa 6), degrees: 22°8'33" at Śaka 1800, 50.2"/year.
  function ayanamsa(date) {
    const v = ahargana(date) / SIDEREAL_YEAR;
    return dms(0, 22, 8, 33) + v / 70 - v / 50 / 60;
  }

  VedicEngine.Ketaki = {
    BODIES: BODIES,
    ahargana: ahargana,
    trueLongitude: trueLongitude,
    positions: positions,
    ayanamsa: ayanamsa,
    _internals: { meanOf: meanOf, uccaOf: uccaOf, sunState: sunState, moonFromMean: moonFromMean, heliocentric: heliocentric,
      geocentric: geocentric, jupiterKarsa: jupiterKarsa, karsaX: karsaX, rahu: rahu },
  };
})(typeof window !== "undefined" ? window : globalThis);
