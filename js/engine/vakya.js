// Vākyakaraṇa (the Vākya-pañcāṅga manual; ed. T.S. Kuppanna Sastri & K.V. Sarma, 1962):
// true Sun, Moon and Rāhu as SIDEREAL longitudes, by the text's own rules and vākya tables.
// Source notes with verse numbers and worked examples: docs/graha-sphuta-sources.md,
// sections A (rules) and C (tables).
//
//  - Day count: Kali days elapsed at MEAN SUNRISE at Ujjain; the epoch sunrise is a Friday
//    (18 Feb 3102 BCE). This is 6 hours after the Sūrya Siddhānta's midnight epoch.
//  - Sun (I.2-8): days-nāḍīs-vināḍīs since the Meṣa saṅkramaṇa read as degrees-minutes-seconds,
//    less the "bhūpajña" deduction tabulated every 10 days.
//  - Moon (I.9-14a): dhruva from the 12372 / 3031 / 248-day cycles + the candra-vākya for the
//    remaining days + the small correction of I.12-14a. The text gives one value per day
//    (at sunrise) and says to interpolate by the daily motion (I.19b); so do we.
//  - Rāhu (I.17-19): mean node.
//  - The reductions to LOCAL TRUE sunrise (I.14b-16: cara, deśāntara, bhujāntara) are
//    conversions of clock time, not changes to the positions. This engine takes an absolute
//    instant, so they are not applied.
//  - Mars..Saturn (ch. II, the mahāvākya cycle tables) are transcribed in the notes but
//    not wired in yet: trueLongitude() throws for them.
(function (global) {
  "use strict";

  const VedicEngine = global.VedicEngine = global.VedicEngine || {};
  const Util = VedicEngine.Util;

  const KALI_SUNRISE_EPOCH_JD = 588465.75;   // Ujjain mean sunrise, Friday 18 Feb 3102 BCE
  const UJJAIN_LONGITUDE_DEG = 75.76667;

  // Kali days elapsed (fractional) at `date`, counted from the epoch sunrise at Ujjain.
  function kaliDays(date) {
    return date.getTime() / 86400000 + 2440587.5 + UJJAIN_LONGITUDE_DEG / 360 - KALI_SUNRISE_EPOCH_JD;
  }

  // ---- Sun -------------------------------------------------------------------
  // I.2-3: Kali days to the Meṣa saṅkramaṇa that begins Kali year Y (elapsed years).
  function meshaSankramana(Y) { return Y * 365 + Y / 4 + (5 * Y - 1237) / 576; }

  // I.4b-5: deduction (arcminutes) at every 10 days from the saṅkramaṇa, 0..370.
  const SUN_DEDUCTION = [0, 14, 32, 54, 78, 105, 133, 163, 194, 224, 254, 284, 311, 335, 358, 376, 391,
    403, 411, 415, 416, 412, 406, 398, 386, 374, 361, 347, 334, 322, 311, 303, 297, 295, 296, 301, 309, 322];

  function sun(t) {
    let Y = Math.floor(t / 365.2586806);
    while (meshaSankramana(Y) > t) Y--;
    while (meshaSankramana(Y + 1) <= t) Y++;
    const d = t - meshaSankramana(Y);            // days = degrees
    const i = Math.min(Math.floor(d / 10), SUN_DEDUCTION.length - 2);
    const ded = SUN_DEDUCTION[i] + (SUN_DEDUCTION[i + 1] - SUN_DEDUCTION[i]) * (d - i * 10) / 10;
    return Util.normDeg(d - ded / 60);
  }

  // ---- Moon ------------------------------------------------------------------
  // Candra-vākyas 1..248 ("gīrnaḥ śreyaḥ ..."), in arcminutes; index 0 = 0.
  // Vākya 148 is taken as 4r26°27' (the kaṭapayādi reading; the edition prints 4-26-17).
  const MOON_VAKYA = [0,
    723, 1449, 2182, 2924, 3679, 4449, 5233, 6033, 6849, 7678, 8518, 9368, 10225, 11084, 11942, 12795,
    13642, 14477, 15301, 16109, 16902, 17680, 18443, 19192, 19930, 20659, 21384, 506, 1230, 1958, 2695, 3443,
    4204, 4980, 5772, 6579, 7401, 8235, 9080, 9933, 10791, 11650, 12507, 13357, 14199, 15030, 15847, 16649,
    17435, 18206, 18962, 19706, 20440, 21166, 289, 1012, 1738, 2470, 3211, 3965, 4732, 5515, 6314, 7127,
    7955, 8794, 9644, 10499, 11358, 12216, 13071, 13918, 14755, 15580, 16390, 17185, 17964, 18728, 19479, 20218,
    20948, 73, 795, 1519, 2247, 2983, 3730, 4489, 5263, 6053, 6858, 7678, 8512, 9356, 10208, 11066,
    11925, 12782, 13633, 14477, 15308, 16127, 16930, 17718, 18491, 19248, 19994, 20728, 21456, 579, 1301, 2026,
    2758, 3498, 4250, 5016, 5797, 6594, 7406, 8232, 9071, 9919, 10774, 11632, 12490, 13345, 14193, 15032,
    15858, 16670, 17467, 18248, 19014, 19766, 20506, 21238, 363, 1085, 1808, 2536, 3270, 4016, 4773, 5546,
    6334, 7137, 7956, 8787, 9631, 10482, 11339, 12198, 13056, 13908, 14752, 15586, 16406, 17211, 18001, 18775,
    19534, 20281, 21017, 145, 869, 1591, 2316, 3046, 3785, 4536, 5300, 6079, 6874, 7684, 8509, 9346,
    10193, 11048, 11906, 12765, 13620, 14470, 15309, 16137, 16950, 17749, 18532, 19299, 20053, 20794, 21526, 652,
    1375, 2098, 2824, 3558, 4302, 5058, 5829, 6615, 7417, 8234, 9065, 9907, 10757, 11614, 12473, 13331,
    14184, 15029, 15863, 16685, 17492, 18284, 19060, 19821, 20569, 21306, 434, 1158, 1880, 2605, 3334, 4072,
    4821, 5584, 6362, 7155, 7963, 8787, 9622, 10469, 11322, 12180, 13039, 13896, 14746, 15586, 16415, 17231,
    18031, 18815, 19585, 20340, 21082, 215, 941, 1664,
  ];
  const ARCSEC = function (r, d, m, s) { return ((r * 30 + d) * 60 + m) * 60 + s; };
  const MOON_EPOCH_DAY = 1600984;
  const MOON_DHRUVA_0 = ARCSEC(7, 2, 0, 7);
  const MOON_CYCLES = [
    { days: 12372, dhruva: ARCSEC(9, 27, 48, 10) },
    { days: 3031, dhruva: ARCSEC(11, 7, 31, 1) },
    { days: 248, dhruva: ARCSEC(0, 27, 44, 6) },
  ];
  const FULL = 1296000;   // arcseconds in a circle

  // True Moon (degrees) at the sunrise ending whole Kali day N.
  function moonAtDay(N) {
    let r = N - MOON_EPOCH_DAY;
    const q = [];
    MOON_CYCLES.forEach(function (c) { const k = Math.floor(r / c.days); q.push(k); r -= k * c.days; });
    const n = r;   // 0..247
    let dhruva = MOON_DHRUVA_0;
    MOON_CYCLES.forEach(function (c, i) { dhruva += ((q[i] % 1296000) * c.dhruva) % FULL; });
    // Daily motion in degrees: this vākya minus the previous one (vākya 0 follows vākya 247
    // of the previous 248-day round, whose end value is the 248-day dhruva 27°44').
    const prev = n === 0 ? MOON_VAKYA[247] - MOON_VAKYA[248] : MOON_VAKYA[n - 1];
    const motionDeg = ((((MOON_VAKYA[n] - prev) % 21600) + 21600) % 21600) / 60;
    // I.12-14a: (daily motion - 13°11') x (32 q3 - 8 q2) vināḍīs, in arcseconds.
    const corr = (motionDeg - (13 + 11 / 60)) * (32 * q[2] - 8 * q[1]);
    return Util.normDeg((dhruva + MOON_VAKYA[n] * 60 + corr) / 3600);
  }

  function moon(t) {
    const N = Math.floor(t);
    const a = moonAtDay(N);
    const step = Util.normDeg(moonAtDay(N + 1) - a);
    return Util.normDeg(a + step * (t - N));
  }

  // ---- Rāhu (I.17-19) ----------------------------------------------------------
  function rahu(t) {
    const r = t - 1600066;
    const x = (((r - r * 9 / 169809) % 6792) + 6792) % 6792;   // days into the 6792-day round
    return Util.normDeg(360 - x / 566 * 30);
  }

  const BODIES = ["sun", "moon", "rahu", "ketu"];

  // Sidereal longitude in degrees [0,360) at `date`.
  function trueLongitude(body, date) {
    const t = kaliDays(date);
    if (body === "sun") return sun(t);
    if (body === "moon") return moon(t);
    if (body === "rahu") return rahu(t);
    if (body === "ketu") return Util.normDeg(rahu(t) + 180);
    throw new Error("Vakya: '" + body + "' is not implemented yet. Available: " + BODIES.join(", "));
  }

  function positions(date) {
    const out = {};
    BODIES.forEach(function (b) { out[b] = trueLongitude(b, date); });
    return out;
  }

  VedicEngine.Vakya = {
    BODIES: BODIES,
    kaliDays: kaliDays,
    trueLongitude: trueLongitude,
    positions: positions,
    _internals: { meshaSankramana: meshaSankramana, sun: sun, moon: moon, moonAtDay: moonAtDay, rahu: rahu, MOON_VAKYA: MOON_VAKYA },
  };
})(typeof window !== "undefined" ? window : globalThis);
