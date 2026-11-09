// Event muhūrtas from Muhūrta Cintāmaṇi (docs/muhurta-chintamani-summary.md,
// "When is it a good or bad time for N?"), one rule per event, for the Find
// muhurta dialog (js/muhurta-finder.js).
//
// Rule fields (all optional; strings are parsed by N() / T() below):
//   naks / midNaks / badNaks   nakṣatra lists (names or classes: dhruva, chara,
//                              kshipra/laghu, mridu/mitra, ugra, mishra, tikshna,
//                              uttaras, purvas, down/up/side for the facing)
//   tithis / badTithis         tithi lists: 1-14 = both pakṣas, 15 = Pūrṇimā,
//                              30 = Amāvāsyā, S3 / K5 = one pakṣa, classes
//                              (nanda, bhadra, jaya, rikta, purna), parva
//   shukla: true               śukla pakṣa only
//   varas / midVaras / badVaras  weekdays, 0 = Sunday
//   masas / badMasas           amānta months, 0 = Caitra
//   sunSigns / badSunSigns     the Sun's sidereal rāśi, 0 = Meṣa
//   uttarayana, noHariShayana, noAdhika, noAsta (Jupiter and Venus visible)
//   time                       "day" | "night" | "forenoon"
//   lagnas / badLagnas         rāśi of the lagna; stdLagna: the standard lagna
//                              (8th empty, Moon not 6/8/12, no kartari, no
//                              malefic in the lagna); jamitra: 7th empty
//   vishaghati, durmuhurta     the event's own extra bad windows (6.49-54)
//   chakra                     Sun's nakṣatra -> Moon's (28-fold) count ranges
//   auspicious: false          skips the blanket rules for auspicious work
//   checkNote                  what the text asks that the finder cannot check
(function (global) {
  "use strict";
  const VedicEngine = global.VedicEngine = global.VedicEngine || {};

  const NAK = { ashvini: 0, bharani: 1, krittika: 2, rohini: 3, mrigashira: 4, ardra: 5, punarvasu: 6, pushya: 7, ashlesha: 8, magha: 9, purvaphalguni: 10, uttaraphalguni: 11, hasta: 12, chitra: 13, svati: 14, vishakha: 15, anuradha: 16, jyeshtha: 17, mula: 18, purvashadha: 19, uttarashadha: 20, shravana: 21, dhanishtha: 22, shatabhisha: 23, purvabhadrapada: 24, uttarabhadrapada: 25, revati: 26 };
  const NCLASS = {
    dhruva: [11, 20, 25, 3], sthira: [11, 20, 25, 3], chara: [14, 6, 21, 22, 23], kshipra: [12, 0, 7], laghu: [12, 0, 7],
    mridu: [4, 26, 13, 16], mitra: [4, 26, 13, 16], maitra: [4, 26, 13, 16], ugra: [10, 19, 24, 1, 9], mishra: [15, 2],
    tikshna: [18, 17, 5, 8], uttaras: [11, 20, 25], purvas: [10, 19, 24],
    down: [18, 8, 2, 15, 10, 19, 24, 9, 1], up: [5, 7, 21, 22, 23, 11, 20, 25, 3], side: [16, 4, 26, 13, 12, 14, 6, 17, 0],
  };
  function N(s) {
    const out = [];
    String(s || "").toLowerCase().split(/[\s,]+/).filter(Boolean).forEach(function (w) {
      const list = NCLASS[w] || (NAK[w] != null ? [NAK[w]] : null);
      if (!list) throw new Error("mc-events: unknown nakṣatra word " + w);
      list.forEach(function (n) { if (out.indexOf(n) === -1) out.push(n); });
    });
    return out;
  }
  // Tithis as absolute numbers 1..30 (śukla 1-15, kṛṣṇa 16-30).
  const TCLASS = { nanda: [1, 6, 11], bhadra: [2, 7, 12], jaya: [3, 8, 13], rikta: [4, 9, 14], purna: [5, 10, 15] };
  function T(s) {
    const out = [];
    function add(n) { if (out.indexOf(n) === -1) out.push(n); }
    String(s || "").toLowerCase().split(/[\s,]+/).filter(Boolean).forEach(function (w) {
      let m;
      if (TCLASS[w]) { TCLASS[w].forEach(function (n) { if (n === 15) { add(15); add(30); } else { add(n); add(n + 15); } }); return; }
      if (w === "parva") { [23, 29, 15, 30].forEach(add); return; }
      if ((m = /^s(\d+)$/.exec(w))) { add(+m[1]); return; }
      if ((m = /^k(\d+)$/.exec(w))) { add(+m[1] + 15); return; }
      const n = +w;
      if (!(n >= 1 && n <= 30)) throw new Error("mc-events: unknown tithi word " + w);
      if (n === 15 || n === 30) add(n); else { add(n); add(n + 15); }
    });
    return out;
  }
  function range(a, b) { const o = []; for (let i = a; i <= b; i++) o.push(i); return o; }

  const BENEFIC = [1, 3, 4, 5];
  const MARRIAGE_NAKS = "Rohini Mrigashira Magha Uttaraphalguni Hasta Svati Anuradha Mula Uttarashadha Uttarabhadrapada Revati";
  const TRAVEL_BEST = "Ashvini Punarvasu Anuradha Mrigashira Pushya Revati Hasta Shravana Dhanishtha";
  const SOWING = "Mula Magha dhruva mridu kshipra Svati Dhanishtha";
  const CHAULA_NAKS = "Punarvasu Pushya Revati Ashvini Shravana Dhanishtha Shatabhisha Hasta Chitra Svati Jyeshtha Mrigashira";
  const UPANAYANA_NAKS = "kshipra dhruva chara mridu Ashlesha Mula purvas Ardra";
  const UPANAYANA_MASAS = [10, 11, 0, 1, 2];
  const HOUSE_NAKS = "dhruva mridu Shatabhisha Svati Hasta Dhanishtha Pushya";
  const FIXED = [1, 4, 7, 10], DUAL = [2, 5, 8, 11], MOVABLE = [0, 3, 6, 9];
  const simanta = { naks: N("Mrigashira Pushya Mula Shravana Punarvasu Hasta dhruva Revati"), shukla: true, badTithis: T("rikta 6 8 12 30"), varas: [0, 2, 4], time: "forenoon", badLagnas: [4, 7, 3, 9, 5], noAstaFault: true };

  const groups = [
    { title: "Life-cycle saṃskāras", events: [
      { id: "menses-bath", name: "First bath after menses", ref: "5.4", naks: N("Hasta Svati Ashvini Mrigashira Anuradha Dhanishtha dhruva Jyeshtha"), badNaks: N("Krittika Bharani Mula Ardra Pushya Punarvasu Magha Chitra Vishakha Shravana"), varas: BENEFIC, checkNote: "4th day after menses; for quick conception Mṛgaśira, Revatī, Svātī, Hasta, Aśvinī, Rohiṇī." },
      { id: "garbhadhana", name: "Garbhādhāna (conception)", ref: "5.5–7", naks: N("uttaras Mrigashira Hasta Anuradha Rohini Svati Shravana Dhanishtha Shatabhisha"), midNaks: N("Chitra Punarvasu Pushya"), badNaks: N("Mula Bharani Ashvini Revati Magha"), badTithis: T("6 8 14 15 30 rikta"), varas: BENEFIC, time: "night", checkNote: "Even nights 4–16 after menses for a son, odd for a daughter; not the janma nakṣatra or 7th tārā; not a parent's śrāddha day." },
      Object.assign({ id: "pumsavana", name: "Puṃsavana", ref: "5.10", checkNote: "3rd (or 4th) month of pregnancy. Asta of Jupiter/Venus and malamāsa are no fault (fixed-time rite)." }, simanta),
      Object.assign({ id: "simanta", name: "Sīmantonnayana", ref: "5.8–9", checkNote: "6th or 8th month (some 4th). Asta and malamāsa are no fault (fixed-time rite)." }, simanta),
      { id: "vishnubali", name: "Viṣṇubali (protecting the foetus)", ref: "5.10", naks: N("Shravana Rohini Pushya"), tithis: T("S7 S12"), time: "forenoon", noAstaFault: true, checkNote: "8th month; no malefic in the 8th." },
      { id: "namakarana", name: "Nāmakaraṇa (naming)", ref: "5.11", naks: N("mridu dhruva kshipra chara"), badTithis: T("parva rikta 9 30"), varas: BENEFIC, time: "forenoon", noAstaFault: true, checkNote: "11th or 12th day (brāhmaṇa 11th, kṣatriya 13th, vaiśya 16th, śūdra a month). Not a Sun, Tuesday or Saturn lagna or navāṃśa." },
      { id: "mother-bath", name: "Mother's first bath after birth", ref: "5.12", naks: N("Revati dhruva Mrigashira Hasta Svati Ashvini Anuradha"), badNaks: N("Ardra Punarvasu Pushya Shravana Magha Bharani mishra Mula Chitra"), badTithis: T("4 6 8 9 12 14"), varas: [0, 2, 4], badVaras: [3, 6], noAstaFault: true },
      { id: "breastfeeding", name: "First breast-feeding", ref: "5.12", naks: N("mridu dhruva kshipra"), badTithis: T("rikta"), badVaras: [2], noAstaFault: true },
      { id: "dolarohana", name: "Dolārohaṇa (first cradle)", ref: "5.14–15", naks: N("mridu laghu dhruva"), varas: BENEFIC, chakra: { name: "Cradle cakra", good: [[1, 5], [21, 28]] }, noAstaFault: true, checkNote: "10th, 12th, 16th, 18th or 32nd day." },
      { id: "nishkramana", name: "Niṣkramaṇa (first outing)", ref: "5.15", naks: N(TRAVEL_BEST + " Rohini"), badNaks: N("down"), badTithis: T("6 8 12 30 rikta"), badLagnas: [11, 7, 0], checkNote: "4th month (or 3rd, or 12th day); śukla or early kṛṣṇa." },
      { id: "jalapuja", name: "Jalapūjā (mother worships water)", ref: "5.16", naks: N("Shravana Pushya Punarvasu Mrigashira Hasta Mula Anuradha"), badTithis: T("rikta"), varas: [1, 3, 4], badMasas: [0, 9], noAdhika: true, checkNote: "After the first month." },
      { id: "annaprashana", name: "Annaprāśana (first solid food)", ref: "5.17", naks: N("dhruva mridu laghu chara"), tithis: T("2 3 5 7 10 13"), varas: BENEFIC, badLagnas: [11, 0, 7], stdLagna: true, checkNote: "Boy: 6th month or later even months; girl: 5th or odd months. Not the 8th sign from the janma rāśi." },
      { id: "bhumi", name: "Seating on the ground", ref: "5.21", naks: N("dhruva Mrigashira Jyeshtha Anuradha laghu"), badTithis: T("rikta"), varas: BENEFIC, checkNote: "5th month; Mars strong." },
      { id: "tambula", name: "First tāmbūla", ref: "5.23", naks: N("dhruva mridu laghu Shravana Mula Punarvasu Jyeshtha Svati Dhanishtha"), badVaras: [2, 6] },
      { id: "karnavedha", name: "Karṇavedha (ear-piercing)", ref: "5.24–25", naks: N("Shravana Dhanishtha Punarvasu mridu laghu"), badTithis: T("rikta"), varas: BENEFIC, badMasas: [0, 9], noHariShayana: true, time: "day", checkNote: "12th or 16th day, 6th–8th month or an odd year; not the janma month or janma tārās." },
      { id: "chaula", name: "Caula / Cūḍākaraṇa (first haircut)", ref: "5.29–33", uttarayana: true, naks: N(CHAULA_NAKS), badTithis: T("1 6 8 12 rikta parva"), varas: BENEFIC, badMasas: [0], stdLagna: true, checkNote: "3rd or 5th year; mother not over 5 months pregnant; not the 8th sign from janma." },
      { id: "haircut", name: "Shaving, haircut, nails", ref: "5.34–36", naks: N(CHAULA_NAKS), badTithis: T("rikta parva 1 6 8"), varas: [1, 3, 4, 5], badVaras: [0, 2, 6], time: "day", noAstaFault: true, auspicious: false, checkNote: "Not within 9 days of the last; not after a bath, oiling or a meal. Any day is fine for a yajña, a wedding, a parent's death or by royal order." },
      { id: "aksharambha", name: "Akṣarārambha (first letters)", ref: "5.37", uttarayana: true, naks: N("laghu Shravana Svati Revati Punarvasu Ardra Chitra Anuradha"), tithis: T("2 3 5 6 10 11 12"), varas: BENEFIC, badVaras: [2, 6], badLagnas: MOVABLE, noHariShayana: true, checkNote: "5th year." },
      { id: "vidyarambha", name: "Vidyārambha (start of study)", ref: "5.38", naks: N("Mrigashira Ardra Punarvasu Hasta Chitra Svati Shravana Dhanishtha Shatabhisha Ashvini Mula purvas Pushya Ashlesha"), tithis: T("2 3 5 6 10 11 12"), varas: [4, 5, 3], midVaras: [0], badVaras: [1, 2, 6] },
      { id: "ankurarpana", name: "Aṅkurārpaṇa (sowing sprouts before a rite)", ref: "5.38", naks: N(SOWING), badTithis: T("parva 13 rikta"), varas: BENEFIC, time: "day", checkNote: "3rd, 5th, 7th or 9th day before the rite; forenoon or evening." },
      { id: "upanayana", name: "Upanayana", ref: "5.39–57", uttarayana: true, masas: UPANAYANA_MASAS, naks: N(UPANAYANA_NAKS), badNaks: N("Bharani Krittika Magha Vishakha Jyeshtha"), tithis: T("S2 S3 S5 S10 S11 S12 K2 K3 K5"), badTithis: T("8 14 15 1 30 4 7 9 13"), varas: [0, 1, 3, 4, 5], badVaras: [2, 6], time: "forenoon", noAsta: true, stdLagna: true, vishaghati: true, checkNote: "Age (brāhmaṇa 8th year, kṣatriya 11th, vaiśya 12th); Jupiter 2, 5, 7, 9 or 11 from the boy's Moon; the Veda-lord strong; nakṣatras by Veda (5.39–57); no thunder at the morning sandhyā." },
      { id: "chhurika", name: "Churikā-bandhana", ref: "5.59", masas: [10, 11, 1, 2], naks: N(UPANAYANA_NAKS), badVaras: [2], checkNote: "Mars must not be set." },
      { id: "keshanta", name: "Keśānta / Godāna", ref: "5.60", uttarayana: true, naks: N(CHAULA_NAKS), badTithis: T("1 6 8 12 rikta parva"), varas: BENEFIC, checkNote: "16th year (kṣatriya 22nd, vaiśya 24th)." },
      { id: "samavartana", name: "Samāvartana", ref: "5.60", uttarayana: true, masas: UPANAYANA_MASAS, naks: N(UPANAYANA_NAKS), badNaks: N("Bharani Krittika Magha Vishakha Jyeshtha"), badTithis: T("8 14 15 1 30 rikta"), badVaras: [2, 6], time: "forenoon", noAsta: true },
    ] },
    { title: "Marriage", events: [
      { id: "kanya-varana", name: "Asking for the bride (kanyā-varaṇa)", ref: "6.10", naks: N("Uttarashadha Svati Shravana purvas Anuradha Dhanishtha Krittika " + MARRIAGE_NAKS), badTithis: T("rikta 8 9"), varas: BENEFIC, badVaras: [2] },
      { id: "vara-varana", name: "Choosing the groom (vara-varaṇa, tilaka)", ref: "6.11", naks: N("dhruva Krittika purvas") },
      { id: "vivaha", name: "Vivāha (marriage)", ref: "6.13–6.91", sunSigns: [0, 1, 2, 7, 9, 10], marriageAshadha: true, naks: N(MARRIAGE_NAKS), tithis: range(2, 25), badTithis: T("rikta 8 6 14 30"), varas: BENEFIC, midVaras: [0, 6], badVaras: [2], noHariShayana: true, noAsta: true, noAdhika: true, vishaghati: true, durmuhurta: true, stdLagna: true, jamitra: true, badLagnasDay: [6, 7, 0, 1, 4, 9, 10, 11], badLagnasNight: [2, 3, 5, 9, 10, 11], checkNote: "Not the first-born's janma month, nakṣatra or tithi; no 'three Jyeṣṭhas'; nakṣatra free of malefic vedha (śalākā cakra); navāṃśa (Tulā, Kanyā, Mithuna, first half of Dhanu, Mīna best); latā, pāta, ekārgala, upagraha and bāṇa; within a month of a death in either family. Godhūli lagna (6.99–101) is an alternative when no clean lagna is found." },
      { id: "vivaha-prep", name: "Pre-wedding work (maṇḍapa, vedi, pots)", ref: "6.96", naks: N(MARRIAGE_NAKS), badNaks: N("Chitra Vishakha Shatabhisha Ashvini Jyeshtha Bharani Ardra Punarvasu Pushya Ashlesha"), checkNote: "On days 1, 2, 4, 5, 7 or 8 before the wedding, not the 3rd, 6th or 9th." },
      { id: "vadhu-pravesha", name: "Vadhū-praveśa (bride's first entry)", ref: "7.1–2", naks: N("dhruva kshipra mridu Shravana Dhanishtha Mula Magha Svati"), badTithis: T("rikta"), badVaras: [0, 2], checkNote: "Within 16 days: even days or the 5th, 7th, 9th; later odd days, months or years (not even year + even month)." },
      { id: "dviragamana", name: "Dvirāgamana (gauna)", ref: "8.1–4", sunSigns: [10, 7, 0, 6, 1], naks: N("laghu dhruva chara mridu Mula"), varas: BENEFIC, lagnas: [2, 11, 5, 6, 1], badMasas: [0, 9], noHariShayana: true, noAdhika: true, noAsta: true, checkNote: "Odd years (1, 3, 5); Venus not in front or on the right (pratiśukra) unless an exempt gotra." },
    ] },
    { title: "Household, trade and daily life", events: [
      { id: "clothes", name: "New clothes or ornaments", ref: "2.10–12", naks: N("Revati Ashvini Dhanishtha Pushya Punarvasu dhruva Hasta Chitra Svati Vishakha Anuradha"), badTithis: T("rikta"), badVaras: [6, 1, 2], noHariShayana: true, checkNote: "Venus not set; not the janma month. Married women not on dhruva, Punarvasu or Puṣya. Red clothes are fine on Tuesday." },
      { id: "planting", name: "Planting trees and creepers", ref: "2.13", naks: N("Vishakha Mula Shatabhisha mridu dhruva kshipra") },
      { id: "meet-king", name: "Meeting a king, official or saint", ref: "2.13", naks: N("dhruva mridu kshipra Shravana Dhanishtha") },
      { id: "cattle-trade", name: "Buying or selling cows", ref: "2.13", naks: N("kshipra Revati Vishakha Punarvasu Jyeshtha Shatabhisha Dhanishtha Svati") },
      { id: "cattle-shed", name: "Cattle into or out of the cowshed", ref: "2.14", naks: N("Ashvini Bharani Krittika Mrigashira Ardra Punarvasu Pushya Ashlesha Magha purvas Hasta Svati Vishakha Anuradha Jyeshtha Mula Dhanishtha Shatabhisha Revati"), badNaks: N("Shravana dhruva Chitra"), badTithis: T("rikta 8 30"), varas: [1, 3, 6], badVaras: [2] },
      { id: "medicine", name: "First dose of medicine", ref: "2.15", naks: N("laghu mridu chara Mula"), varas: [0, 1, 3, 4, 5], lagnas: DUAL, auspicious: false, checkNote: "Not the patient's janma nakṣatra; houses 7, 8, 12 empty." },
      { id: "sewing", name: "Sewing; putting on armour", ref: "2.15", naks: N("Punarvasu Dhanishtha Chitra Anuradha Ashvini") },
      { id: "buying", name: "Buying", ref: "2.16", naks: N("Revati Shatabhisha Ashvini Svati Shravana Chitra") },
      { id: "selling", name: "Selling", ref: "2.17", naks: N("purvas Vishakha Krittika Ashlesha Bharani") },
      { id: "shop", name: "Opening a shop", ref: "2.17", naks: N("mridu dhruva kshipra chara"), badTithis: T("rikta"), badVaras: [2], badLagnas: [10], checkNote: "Venus or the Moon in the lagna; benefics in 2, 10, 11." },
      { id: "horses", name: "Horses: buying, selling, riding, training", ref: "2.18", naks: N("kshipra Revati Dhanishtha Mrigashira Svati Shatabhisha Punarvasu"), badTithis: T("rikta"), badVaras: [2] },
      { id: "elephants", name: "Elephants", ref: "2.18", naks: N("mridu kshipra chara") },
      { id: "ornaments", name: "Making ornaments", ref: "2.19", naks: N("chara kshipra dhruva") },
      { id: "gems", name: "Setting gems", ref: "2.19", naks: N("Ashvini Krittika Mrigashira Punarvasu Pushya Hasta Chitra Svati Vishakha Anuradha Shravana Dhanishtha Shatabhisha Revati"), badNaks: N("tikshna ugra dhruva"), varas: [0, 2], lagnas: [0, 7, 4] },
      { id: "pearls", name: "Pearls", ref: "2.19", naks: N("chara dhruva mridu kshipra"), varas: [1, 5], lagnas: [3, 1, 6] },
      { id: "weapons-make", name: "Making weapons", ref: "2.19", naks: N("tikshna ugra Ashvini Mrigashira Vishakha Krittika"), auspicious: false },
      { id: "weapons-take", name: "Taking up weapons", ref: "2.21", naks: N("mitra dhruva laghu Punarvasu Jyeshtha Vishakha"), varas: [5, 4, 0], badTithis: T("rikta"), lagnas: FIXED },
      { id: "bed", name: "First use of a bed, seat or sandals", ref: "2.21", naks: N("Shravana Bharani Punarvasu Jyeshtha") },
      { id: "gold-dishes", name: "Eating from gold or silver dishes", ref: "2.19", naks: N("laghu mitra dhruva mridu"), varas: BENEFIC },
      { id: "coins", name: "Minting coins", ref: "2.20", naks: N("dhruva mridu kshipra chara"), tithis: T("purna jaya"), badVaras: [1, 6], noAsta: true },
      { id: "washing", name: "Washing clothes", ref: "2.20", naks: N("Dhanishtha Ashvini Hasta Chitra Svati Vishakha Anuradha Punarvasu Pushya"), badTithis: T("rikta parva 6 12 15"), badVaras: [6, 3, 2, 0], auspicious: false },
      { id: "lending", name: "Lending money", ref: "2.27", naks: N("Svati Punarvasu mridu Vishakha Pushya Shravana Dhanishtha Shatabhisha Ashvini"), badVaras: [3], lagnas: MOVABLE, checkNote: "Repaying a debt is good on Tuesday." },
      { id: "borrowing", name: "Borrowing money", ref: "2.27", badVaras: [2], noVriddhiYoga: true, noSunHasta: true, noSankrantiDay: true, auspicious: false },
      { id: "wells", name: "Digging wells and tanks", ref: "2.25", naks: N("Anuradha Hasta dhruva Dhanishtha Shatabhisha Purvashadha Magha Revati Pushya Mrigashira"), checkNote: "The Moon in a watery sign; Jupiter or Mercury in the lagna; Venus in the 10th." },
      { id: "dance", name: "Starting dance", ref: "2.25", naks: N("Anuradha Hasta dhruva Dhanishtha Shatabhisha Revati Pushya Mrigashira Jyeshtha") },
      { id: "service", name: "Entering service", ref: "2.26", naks: N("kshipra mitra"), varas: [0, 3, 4, 5], checkNote: "The Sun or Mars in the 10th or 11th; friendly yonis of master and servant." },
      { id: "ploughing", name: "First ploughing", ref: "2.28", naks: N("Mula Vishakha Magha chara dhruva mridu kshipra"), badVaras: [0, 6], badTithis: T("rikta 6 8"), badLagnas: [4, 10, 3, 0, 9, 6], checkNote: "Jupiter in the lagna; the Moon in a watery navāṃśa." },
      { id: "sowing", name: "Sowing seed", ref: "2.29", naks: N(SOWING), badVaras: [2], badTithis: T("rikta 6 8"), chakra: { name: "Hala cakra", good: [[4, 11], [21, 28]] }, checkNote: "Rāhu (phaṇi) cakra is shown in Today Special." },
      { id: "transplanting", name: "Transplanting", ref: "2.32", naks: N("Vishakha Purvabhadrapada Mula Rohini Shatabhisha Uttaraphalguni"), badVaras: [6, 2] },
      { id: "harvest", name: "Harvesting", ref: "2.31", naks: N("tikshna Purvabhadrapada Krittika Mrigashira uttaras Hasta Dhanishtha Shravana Svati Purvashadha Bharani Chitra Pushya"), badVaras: [6, 2], badTithis: T("rikta"), lagnas: FIXED },
      { id: "threshing", name: "Threshing", ref: "2.32", naks: N("Purvaphalguni Uttaraphalguni Shravana Magha Jyeshtha Rohini Mula Anuradha Revati") },
      { id: "storing-grain", name: "Storing grain", ref: "2.33", naks: N("Ashvini Bharani Rohini Mrigashira Punarvasu Pushya uttaras Hasta Chitra Svati Anuradha Shravana Dhanishtha Shatabhisha Revati"), badNaks: N("mishra ugra tikshna Ardra"), varas: BENEFIC, badLagnas: [0, 3, 6] },
      { id: "lending-grain", name: "Lending grain", ref: "2.33", naks: N("dhruva Pushya Vishakha Jyeshtha Ashvini chara") },
      { id: "new-grain", name: "Eating the new grain", ref: "2.37", naks: N("chara kshipra mridu"), badTithis: T("nanda"), badMasas: [0, 9], badVaras: [6, 2], vishaghati: true },
      { id: "blood-letting", name: "Blood-letting", ref: "2.30", naks: N("Chitra Svati Anuradha Jyeshtha Rohini Mrigashira Shatabhisha laghu Shravana"), varas: [2, 0, 4], auspicious: false },
      { id: "purge", name: "Purge or emetic", ref: "2.30", naks: N("Chitra Svati Anuradha Jyeshtha Rohini Mrigashira Shatabhisha laghu Shravana"), badVaras: [3, 6], auspicious: false },
      { id: "homa", name: "Big homa (koṭi-homa, mahārudra)", ref: "2.30, 2.35–36", naks: N("mitra kshipra chara dhruva"), varas: [0, 1, 3, 4, 5], agniVasa: true, homaMouth: true, checkNote: "Jupiter strong." },
      { id: "shanti", name: "Śānti and pauṣṭika rites", ref: "2.34", naks: N("kshipra dhruva chara mitra Revati Magha"), noAsta: true, checkNote: "If a portent demands it, asta does not bar it." },
      { id: "boat-build", name: "Building a boat", ref: "2.38", naks: N("Ashvini Mrigashira Punarvasu Pushya purvas Uttaraphalguni Hasta Chitra Svati Anuradha Mula Uttarashadha Shravana Dhanishtha Shatabhisha Uttarabhadrapada Revati"), varas: [5, 4, 0] },
      { id: "boat-launch", name: "Launching a boat", ref: "2.38", naks: N("Shravana Dhanishtha Purvaphalguni Anuradha Ashvini Hasta"), varas: BENEFIC },
      { id: "voyage", name: "A sea voyage", ref: "2.38, 11.46", naks: N("Ashvini Hasta Pushya Mrigashira Purvaphalguni Anuradha Dhanishtha Shravana"), lagnas: [3, 7, 11, 9, 10] },
      { id: "recovery-bath", name: "Bath after recovering from illness", ref: "2.40", naks: N("Ashvini Bharani Krittika Mrigashira Ardra Purvaphalguni Hasta Chitra Vishakha Anuradha Jyeshtha Mula Purvashadha Shravana Dhanishtha Purvabhadrapada"), badNaks: N("Revati Punarvasu dhruva Magha Svati Ashlesha Pushya Shatabhisha"), tithis: T("rikta"), varas: [0, 2, 4], badVaras: [5, 1], lagnas: MOVABLE, auspicious: false },
      { id: "crafts", name: "Starting crafts (carving, images)", ref: "2.41", naks: N("mridu dhruva kshipra chara"), checkNote: "Mercury or Jupiter in the 10th or the lagna." },
      { id: "treaty", name: "Treaty or friendship", ref: "2.42", naks: N("Pushya Anuradha Purvaphalguni"), tithis: T("8 12"), checkNote: "Taitila karaṇa." },
      { id: "ordeal", name: "Ordeals (divya)", ref: "2.43", naks: N("Hasta Punarvasu Shravana Jyeshtha Shatabhisha"), badTithis: T("8 14"), badVaras: [6, 2], time: "forenoon", checkNote: "Not the nāḍī nakṣatras (1, 10, 16, 18, 23, 25 from the janma nakṣatra)." },
      { id: "shraddha", name: "Śrāddha / preta rites (when delayed)", ref: "2.48", naks: N("Ashvini Pushya Hasta Ashlesha Mula Jyeshtha Shravana Ardra Svati"), noPanchaka: true, auspicious: false },
      { id: "effigy", name: "Effigy cremation", ref: "2.51–52", naks: N("Shravana Hasta Svati Ashvini Pushya Anuradha Purvaphalguni Punarvasu dhruva Vishakha Mrigashira Chitra Dhanishtha"), badNaks: N("tikshna ugra Revati Shatabhisha"), varas: [0, 1, 4], midVaras: [3], badVaras: [5, 2, 6], badTithis: T("13 14 30 nanda"), krishnaOnly: true, noTripushkara: true, auspicious: false, checkNote: "A body actually present needs no muhūrta. Not in Dakṣiṇāyana after the first year." },
      { id: "pratishtha", name: "Pratiṣṭhā of images, tanks, gardens", ref: "2.61–63", uttarayana: true, masas: [10, 11, 0, 1, 2], naks: N("mridu kshipra chara dhruva"), shukla: true, badTithis: T("rikta"), badVaras: [2], time: "forenoon", lagnas: FIXED.concat(DUAL), noAsta: true, stdLagna: true, checkNote: "Fierce deities may be installed in Dakṣiṇāyana; the deity's own nakṣatra (Puṣya planets, Mūla Durgā, Anurādhā Kubera, Hasta Sūrya, Śravaṇa Śiva) also serves. Not the vaināśika nakṣatras." },
    ] },
    { title: "Travel", events: ["east", "south", "west", "north"].map(function (dir) {
      return { id: "travel-" + dir, name: "Travel " + dir, ref: "11.8–56", direction: dir, sunSigns: [8, 0, 4, 9, 10, 2, 5, 1, 6], naks: N(TRAVEL_BEST), midNaks: N("Rohini uttaras Mula Shatabhisha Purvashadha Jyeshtha"), badNaks: N("Krittika Svati Vishakha Ardra Ashlesha Chitra Magha Bharani purvas"), badTithis: T("6 8 12 S1 15 30 rikta"), varas: BENEFIC, badVaras: [0, 2, 6], vishaghati: true, stdLagna: true, badLagnas: [10, 11], travel: true, checkNote: "Taras 3, 5, 7 from janma; the ghāta Moon, tithi, weekday and nakṣatra of one's janma rāśi; pratiśukra (Venus in front); prasthāna rules (11.91–97)." };
    }).concat([
      { id: "return-home", name: "Returning home after travel", ref: "11.109", naks: N("mridu dhruva kshipra chara"), checkNote: "Never on the 9th tithi, nakṣatra or weekday from the day you left." },
      { id: "vijayadashami", name: "Vijayādaśamī (good for all work)", ref: "11.78", masas: [6], tithis: T("S10"), auspicious: false },
    ]) },
    { title: "House", events: [
      { id: "house-start", name: "Start building a house (digging foundations)", ref: "12.6–19", sunSigns: [0, 1, 3, 4, 6, 7, 9, 10], naks: N(HOUSE_NAKS), tithis: T("2 3 5 6 7 10 11 12 13 15"), badVaras: [0, 2], lagnas: FIXED.concat(DUAL), stdLagna: true, chakra: { name: "Vṛṣa-vāstu cakra", good: [[8, 18]] }, checkNote: "Foundations ideally on adhomukha nakṣatras; the owner's Sun, Moon, Jupiter, Venus strong; dig opposite Rāhu's mouth (12.19); door-direction tithis (12.17)." },
      { id: "house-roof", name: "Laying the slab or roof", ref: "12.18–19", naks: N("up"), tithis: T("2 3 5 6 7 10 11 12 13 15"), badVaras: [0, 2], lagnas: FIXED.concat(DUAL), checkNote: "Not raising pillars in Dhaniṣṭhā-pañcaka." },
      { id: "house-doors", name: "Fixing the doors", ref: "12.18–19", naks: N("side"), tithis: T("2 3 5 6 7 10 11 12 13 15"), badVaras: [0, 2], lagnas: FIXED.concat(DUAL) },
    ].concat([["east", "purna"], ["south", "nanda"], ["west", "bhadra"], ["north", "jaya"]].map(function (d) {
      return { id: "griha-" + d[0], name: "Gṛhapraveśa (house entry), door facing " + d[0], ref: "13.5–6, 12.15, 5.26", uttarayana: true, naks: N(HOUSE_NAKS), tithis: T(d[1]), badTithis: T("rikta 30"), badVaras: [0, 2], noAsta: true, stdLagna: true, lagnas: FIXED.concat(DUAL), chakra: { name: "Kalaśa cakra", good: [[6, 13], [22, 28]] }, checkNote: "The verses giving the house-entry months and nakṣatras are missing from the scan; the house-building nakṣatras (12.15) are used. Keep the Sun on the entrant's left (vāma-ravi)." };
    })) },
    { title: "Royal and fire rites", events: [
      { id: "agnyadhana", name: "Agnyādhāna (setting up sacred fires)", ref: "9.1–3", uttarayana: true, naks: N("Krittika Vishakha dhruva Revati Mrigashira Jyeshtha Pushya"), badTithis: T("rikta"), badLagnas: [3, 9, 11, 10], moonNotInLagna: true, checkNote: "No muhūrta needed at the wedding or in its fixed season." },
      { id: "rajyabhisheka", name: "Rājyābhiṣeka (coronation)", ref: "10.1–4", uttarayana: true, naks: N("Jyeshtha Shravana kshipra mridu dhruva"), badMasas: [0], badTithis: T("rikta 30"), badVaras: [2, 3], time: "day", noAdhika: true, stdLagna: true, checkNote: "Jupiter, Moon, Venus, Mars, Sun and the lagna, 10th and janma lords strong." },
    ] },
    { title: "Saṅkrānti", events: [
      { id: "sankranti", name: "Saṅkrānti puṇya-kāla (bathing, giving, śrāddha)", ref: "3.5–8", sankranti: true, auspicious: false },
    ] },
  ];

  VedicEngine.MCEvents = {
    groups: groups,
    // 6.49-51 viṣaghaṭī: start ghaṭī (of the nakṣatra's 60) of its 4-ghaṭī window.
    vishaghatiStart: [50, 24, 30, 40, 14, 21, 30, 20, 32, 30, 20, 18, 21, 20, 14, 14, 10, 14, 56, 24, 20, 10, 10, 18, 16, 24, 30],
    // 6.54 the weekday's bad day-muhūrtas (1-based).
    durmuhurta: [[14], [9, 12], [], [8], [6, 12], [9, 4], [1, 2]],
    // 6.66 dagdha tithi by the Sun's rāśi (pakṣa tithi).
    dagdhaBySun: [6, 4, 8, 6, 10, 8, 12, 10, 2, 12, 4, 2],
    // 11.36-38 the side of each nakṣatra (parigha), and those good in any direction.
    nakSide: function (i) { return i >= 2 && i <= 8 ? "east" : i >= 9 && i <= 15 ? "south" : i >= 16 && i <= 21 ? "west" : "north"; },
    anyDirection: N("Anuradha Hasta Pushya Ashvini Mrigashira Revati Shravana Dhanishtha"),
    // 1.37 commentary: dishāśūla, the direction not to travel on each weekday.
    dishashula: ["west", "east", "north", "north", "south", "west", "east"],
    // 11.34 yoginī's direction by pakṣa tithi.
    yogini: { 1: "east", 9: "east", 3: "southeast", 11: "southeast", 5: "south", 13: "south", 4: "southwest", 12: "southwest", 6: "west", 14: "west", 7: "northwest", 15: "northwest", 2: "north", 10: "north", 8: "northeast" },
    // 11.11 time of day by nakṣatra class for travel.
    travelTime: { dhruva: "forenoon", mishra: "forenoon", tikshna: "midday", ugra: "afternoon", laghu: "evening", mridu: "midnight", chara: "lateNight" },
    NCLASS: NCLASS,
  };
})(typeof window !== "undefined" ? window : globalThis);
