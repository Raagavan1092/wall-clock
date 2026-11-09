// Tables from Muhūrta Cintāmaṇi, Prakaraṇas 1 (Śubhāśubha) and 2 (Nakṣatra),
// transcribed from docs/muhurta-chintamani-summary.md. "1.37" = Prakaraṇa 1,
// verse 37. Used by js/render/mc-yogas.js.
//
// Index conventions (same as the engine):
//   nakṣatra 0 = Aśvinī .. 26 = Revatī (Abhijit is handled separately in the
//            28-fold counts, see mc-yogas.js)
//   vāra     0 = Sunday .. 6 = Saturday
//   tithi    pakṣa-relative 1..15 (15 = Pūrṇimā in śukla, Amāvāsyā in kṛṣṇa)
//   māsa     amānta, 0 = Caitra .. 11 = Phālguna
//   rāśi     0 = Meṣa .. 11 = Mīna
(function (global) {
  "use strict";
  const VedicEngine = global.VedicEngine = global.VedicEngine || {};

  // Nakṣatra classes (2.2-8), with the weekday of the same nature.
  const NAK_CLASS = {
    dhruva: { name: "Dhruva (fixed)", naks: [11, 20, 25, 3], vara: 0, use: "Fixed work: sowing, building a house, śānti, gardens, founding a town" },
    chara: { name: "Cara (moving)", naks: [14, 6, 21, 22, 23], vara: 1, use: "Riding, garden outings, travel" },
    ugra: { name: "Ugra (fierce)", naks: [10, 19, 24, 1, 9], vara: 2, use: "Killing, fire, deceit, poison, weapons" },
    mishra: { name: "Miśra (mixed)", naks: [15, 2], vara: 3, use: "Agnihotra, kāmya vṛṣotsarga, ugra work" },
    kshipra: { name: "Kṣipra / Laghu (swift)", naks: [12, 0, 7], vara: 4, use: "Trade, learning, ornaments, crafts and the 64 arts" },
    mridu: { name: "Mṛdu / Maitra (soft)", naks: [4, 26, 13, 16], vara: 5, use: "Singing, clothes, play, work for friends, ornaments" },
    tikshna: { name: "Tīkṣṇa / Dāruṇa (sharp)", naks: [18, 17, 5, 8], vara: 6, use: "Abhicāra, killing, splitting friends, taming animals, binding" },
  };
  function cls() { // union of named classes
    const out = [];
    Array.prototype.forEach.call(arguments, function (c) { NAK_CLASS[c].naks.forEach(function (n) { if (out.indexOf(n) === -1) out.push(n); }); });
    return out;
  }
  function plus(a, b) { return a.concat(b.filter(function (n) { return a.indexOf(n) === -1; })); }
  function allBut(list) { const out = []; for (let i = 0; i < 27; i++) if (list.indexOf(i) === -1) out.push(i); return out; }

  const D = {
    // ---- Tithi (1.3, 1.4, 1.7) ----------------------------------------------
    tithiLord: ["Agni", "Brahmā", "Gaurī", "Gaṇeśa", "Sarpa (Nāga)", "Guha (Kārttikeya)", "Sūrya", "Śiva", "Durgā", "Yama", "Viśvedevas", "Hari", "Kāma", "Śiva", "Candra"],
    amavasyaLord: "Pitṛs",
    // 0 nandā, 1 bhadrā, 2 jayā, 3 riktā, 4 pūrṇā, by (pakṣa tithi - 1) % 5
    tithiClass: ["Nandā", "Bhadrā", "Jayā", "Riktā", "Pūrṇā"],
    tithiClassResult: ["joy", "good", "victory", "empty: auspicious work fails", "full result"],
    // Work suited to each tithi (1.3, after Vasiṣṭha). Index = pakṣa tithi; 30 = Amāvāsyā.
    tithiWork: {
      1: { avoid: "Marriage, travel, upanayana, pratiṣṭhā, sīmanta, caula, gṛha-praveśa, vāstu (śukla Pratipadā)" },
      2: { do: "Travel, marriage, ornaments, music, crafts, other auspicious work" },
      3: { do: "As for the 2nd: travel, marriage, ornaments, music, crafts" },
      4: { do: "Harsh work: binding, weapons, poison, fire", avoid: "Auspicious work (riktā)" },
      5: { do: "As for the 2nd and 3rd" },
      6: { do: "Battle, crafts, vāstu, ornaments", avoid: "Oil massage, travel, rites for the ancestors, tooth twig" },
      7: { do: "All work of the 2nd, 3rd and 5th" },
      8: { do: "Battle, vāstu, crafts, royal pleasures, writing, gems, ornaments" },
      9: { do: "Harsh work: binding, weapons, poison, fire", avoid: "Auspicious work (riktā)" },
      10: { do: "Work of the 2nd, 3rd, 5th and 7th" },
      11: { do: "Vratas, fasts, religious acts, festivals, udyāpana" },
      12: { do: "All auspicious and pauṣṭika work", avoid: "Travel" },
      13: { do: "Work of the 2nd, 3rd, 5th, 7th and 10th" },
      14: { do: "Harsh work: binding, weapons, poison, fire", avoid: "Auspicious work (riktā)" },
      15: { do: "Marriage, crafts, pauṣṭika and maṅgala work, battle, vāstu, yajña, pratiṣṭhā" },
      30: { do: "Rites for the ancestors only", avoid: "Auspicious work (it comes to nothing)" },
    },
    // Personal prohibitions (1.6, 1.7). Keys: pakṣa tithi; 30 = Amāvāsyā, 45 = Pūrṇimā.
    tithiProhibit: [
      { tithis: [6], text: "No oil massage (1.7)" },
      { tithis: [8], text: "No meat (1.7)" },
      { tithis: [14], text: "No shaving or hair-cutting (1.7)" },
      { tithis: [30, 45], text: "No sexual union (1.7; the commentary extends this to all parvas)" },
      { tithis: [2, 10, 13], text: "No abhyaṅga or udvartana (1.7)" },
      { tithis: [7, 9, 30], text: "No bath with āmalaka paste (1.7)" },
      { tithis: [1, 6, 30], text: "No tooth-cleaning with a twig, nor gathering wood (1.6; Kāśīkhaṇḍa adds the 9th and Sunday; powder is allowed)" },
    ],

    // ---- Tithi + vāra yogas (1.4-1.8) ----------------------------------------
    // Siddha (1.4): tithi class by weekday, -1 = none.
    siddhaClassByVara: [-1, -1, 2, 1, 4, 0, 3],
    // Amṛta (1.5a, read with the commentators; the plain reading is Mṛtyu).
    amritaClassByVara: [0, 1, 0, 2, 3, 1, 4],
    dagdhaNakByVara: [1, 13, 20, 22, 11, 17, 26], // 1.5b
    krakachaTithiByVara: [12, 11, 10, 9, 8, 7, 6], // 1.6: vāra no. + tithi = 13
    samvartaka: [[3, 1], [0, 7]], // 1.6: [vāra, tithi]
    dagdhaTithiByVara: [12, 11, 5, 3, 6, 8, 9], // 1.8
    vishaTithiByVara: [4, 6, 7, 2, 8, 9, 7],
    hutashanaTithiByVara: [12, 6, 7, 8, 9, 10, 11],
    yamaghantaNakByVara: [9, 15, 5, 18, 2, 3, 12], // 1.9
    // Māsa-śūnya tithis (1.10): [kṛṣṇa list, śukla list] by amānta month.
    masaShunyaTithi: [[[8, 9], [8, 9]], [[12], [12]], [[14], [13]], [[6], [7]], [[2, 3], [2, 3]], [[1, 2], [1, 2]], [[10, 11], [10, 11]], [[5], [14]], [[7, 8], [7, 8]], [[4, 5], [4, 5]], [[5], [6]], [[4], [3]]],
    // Bad tithi + nakṣatra (1.11-13): pakṣa tithi -> nakṣatras.
    badTithiNak: { 1: [20], 2: [16], 3: [11, 20, 25], 5: [9], 6: [3], 7: [12, 18], 8: [24], 9: [2], 11: [3], 12: [8], 13: [14, 13] },
    masaShunyaNak: [[0, 3], [13, 14], [20, 7], [10, 22], [20, 21], [23, 26], [24], [2, 9], [13, 15], [5, 0, 12], [21, 18], [1, 17]], // 1.14-15
    shunyaRashiByMasa: [10, 11, 1, 2, 0, 5, 7, 6, 8, 3, 9, 4], // 1.16
    dagdhaLagna: { 1: [6, 9], 3: [4, 9], 5: [2, 5], 7: [8, 3], 9: [3, 4], 11: [8, 11], 13: [1, 11] }, // 1.17
    // Siddha (vāra + nakṣatra) pairs that turn bad on a tithi (1.20-21): [nakṣatra, tithi] by vāra.
    siddhaBhanga: [[12, 5], [4, 6], [0, 7], [16, 8], [7, 9], [26, 10], [3, 11]],
    // Good yogas still to avoid for one act (1.22): [vāra, nakṣatra, act].
    siddhaCaution: [[2, 0, "gṛha-praveśa"], [6, 3, "travel"], [4, 7, "marriage"]],

    // ---- Ānandādi (1.23-26, 1.30) --------------------------------------------
    anandadiNames: ["Ānanda", "Kāladaṇḍa", "Dhūmra", "Dhātā", "Saumya", "Dhvāṅkṣa", "Ketu", "Śrīvatsa", "Vajra", "Mudgara", "Chatra", "Mitra", "Mānasa", "Padma", "Lumba", "Utpāta", "Mṛtyu", "Kāṇa", "Siddhi", "Śubha", "Amṛta", "Musala", "Gadā", "Mātaṅga", "Rākṣasa", "Cara", "Sthira", "Pravardhamāna"],
    anandadiBad: [2, 3, 6, 7, 9, 10, 15, 16, 17, 18, 22, 23, 25], // 1-based
    // 1.26: ghaṭīs to drop from the start if unavoidable (absent = the whole yoga).
    anandadiPartial: { 6: 5, 9: 5, 10: 5, 15: 4, 23: 7, 3: 1, 18: 2, 22: 2 },
    // Starting nakṣatra per weekday in the 28-fold list (Abhijit = 21).
    anandadiStart28: [0, 4, 8, 12, 16, 20, 24],

    // ---- Other day yogas -----------------------------------------------------
    raviYogaCounts: [4, 6, 9, 10, 13, 20], // 1.27
    sarvartha: [[12, 18, 11, 20, 25, 7, 0], [21, 3, 4, 7, 16], [0, 25, 2, 8], [3, 16, 12, 2, 4], [26, 16, 0, 6, 7], [26, 16, 0, 6, 21], [21, 3, 14]], // 1.28-29
    tripushkaraNaks: [2, 6, 11, 15, 20, 24], dvipushkaraNaks: [4, 13, 22], pushkaraVaras: [0, 2, 6], // 2.50
    // Nitya yogas (1.35): index -> ghaṭīs to avoid from its start (0.5 = first half).
    nityaPartial: { 0: 3, 14: 3, 18: 0.5, 8: 5, 9: 6, 5: 6, 12: 9 },
    nityaWhole: [16, 26], // Vyatīpāta, Vaidhṛti
    pakshaRandhra: { 4: 8, 6: 9, 8: 14, 9: 25, 12: 10, 14: 5 }, // 1.36
    // Manvādi / Yugādi (1.57): [māsa, "s"/"k", pakṣa tithi, label].
    manvadi: [[0, "s", 3], [0, "s", 15], [7, "s", 12], [7, "s", 15], [3, "s", 10], [3, "s", 15], [2, "s", 15], [11, "s", 15], [6, "s", 9], [10, "s", 7], [9, "s", 11], [5, "s", 3], [4, "k", 15], [4, "k", 8]],
    yugadi: [[7, "s", 9, "Kṛta"], [1, "s", 3, "Tretā"], [5, "k", 13, "Dvāpara"], [10, "k", 15, "Kali"]],

    // ---- Daily windows -------------------------------------------------------
    // 1.37: the n-th day muhūrta (1-based) by weekday.
    namedMuhurta: {
      "Kulika": [14, 12, 10, 8, 6, 4, 2],
      "Kālavelā": [8, 6, 4, 2, 14, 12, 10],
      "Yamaghaṇṭa": [10, 8, 6, 4, 2, 14, 12],
      "Kaṇṭaka": [6, 4, 2, 14, 12, 10, 8],
    },
    // 1.38-39: bad 16ths of the daytime by weekday (1-based).
    badKalamsha: [[6, 7, 8, 10, 14], [4, 6, 8, 9, 12, 13, 14], [2, 3, 4, 6, 10], [2, 4, 8, 9, 10, 14], [2, 6, 12, 14, 15, 16], [4, 5, 6, 9, 10, 12, 14], [1, 2, 8, 10, 11, 12]],
    // 1.44 Bhadrā mouth / tail: prahara (1-8) of the tithi, by "s4" etc.
    bhadra: { s4: [5, 8], s8: [2, 1], s11: [7, 6], s15: [4, 3], k3: [8, 7], k7: [3, 2], k10: [6, 5], k14: [1, 4] },
    // 1.45 where Bhadrā lives, by the Moon's rāśi.
    bhadraAbode: ["svarga", "svarga", "svarga", "bhūmi", "bhūmi", "pātāla", "pātāla", "svarga", "pātāla", "pātāla", "bhūmi", "bhūmi"],

    // ---- Nakṣatra (Prakaraṇa 2) ----------------------------------------------
    NAK_CLASS: NAK_CLASS,
    nakLord: ["Aśvins", "Yama", "Agni", "Brahmā", "Candra", "Rudra", "Aditi", "Bṛhaspati", "Sarpa", "Pitṛs", "Bhaga", "Aryaman", "Sūrya", "Tvaṣṭā", "Vāyu", "Indrāgnī", "Mitra", "Indra", "Nirṛti", "Āpaḥ (water)", "Viśvedevas", "Viṣṇu", "Vasus", "Varuṇa", "Aja-ekapād", "Ahirbudhnya", "Pūṣan"],
    facing: { down: [18, 8, 2, 15, 10, 19, 24, 9, 1], up: [5, 7, 21, 22, 23, 11, 20, 25, 3], side: [16, 4, 26, 13, 12, 14, 6, 17, 0] },
    facingUse: { down: "Digging: wells, tanks, foundations, mines, treasure", up: "Tall work: palaces, coronation, raising flags", side: "Roads, dams, machines, vehicles and boats, ploughing, travel" },
    eye: [ // 2.22-23, cycle from Rohiṇī
      { name: "Andhākṣa", naks: [3, 7, 11, 15, 19, 22, 26], result: "lost property soon recovered" },
      { name: "Mandākṣa", naks: [4, 8, 12, 16, 20, 23, 0], result: "recovered with effort" },
      { name: "Madhyākṣa", naks: [5, 9, 13, 17, 24, 1], result: "news from afar, not recovered" },
      { name: "Sulocana", naks: [6, 10, 14, 18, 21, 25, 2], result: "never recovered" },
    ],
    stars: [3, 3, 6, 5, 3, 1, 4, 3, 5, 5, 2, 2, 5, 1, 1, 4, 4, 3, 11, 2, 2, 3, 4, 100, 2, 2, 32], // 2.58
    shape: ["horse's head", "yoni", "razor", "cart", "deer's head", "gem", "house", "arrow", "wheel", "hall", "cot", "bed", "hand", "pearl", "coral", "arch (toraṇa)", "heap of bali", "earring", "lion's tail", "elephant's tusk", "platform", "three footprints", "drum (mṛdaṅga)", "circle", "cot", "twins", "drum (mardala)"],
    illness: [ // 2.45-46: how long an illness that begins on the nakṣatra lasts
      { naks: [14, 17, 10, 19, 24, 5, 8], text: "grave (death, per the text)" },
      { naks: [26, 16], text: "long" },
      { naks: [1, 21, 23, 13], text: "11 days" },
      { naks: [15, 12, 22], text: "15 days" },
      { naks: [18, 2, 0], text: "9 days" },
      { naks: [9], text: "20 days" },
      { naks: [25, 11, 7, 6, 3], text: "7 days" },
      { naks: [4, 20], text: "1 month" },
    ],
    snakeFatal: [9, 15, 18, 8, 1, 2, 5], // 2.46
    pretaKriya: [0, 7, 12, 8, 18, 17, 21, 5, 14], // 2.48
    mulaAbodeByMasa: ["bhūmi", "pātāla", "pātāla", "svarga", "bhūmi", "svarga", "svarga", "bhūmi", "pātāla", "bhūmi", "svarga", "pātāla"], // 2.56
    deityNak: [ // 2.63
      { naks: [7], text: "the planets (and Śiva, Brahmā)" },
      { naks: [26], text: "Gaṇeśa, yakṣas, sarpas, bhūtas" },
      { naks: [18], text: "Durgā" }, { naks: [16], text: "Kubera, Skanda" }, { naks: [12], text: "Sūrya" },
      { naks: [21], text: "Śiva, Brahmā; the Jina" }, { naks: [22], text: "the lokapālas" },
      { naks: [11, 20, 25, 3], text: "all other deities" },
    ],

    // Activities (Prakaraṇa 2): today is listed as suitable when the nakṣatra is
    // in `naks` and the weekday / tithi are not barred. `need` = what else the
    // text asks for (lagna etc.), shown alongside.
    activities: [
      { v: "2.10", name: "New clothes, coral, ivory, gold", naks: plus(plus([26, 0, 22, 7, 6], cls("dhruva")), [12, 13, 14, 15, 16]), badVara: [6, 1, 2], badClass: [3] },
      { v: "2.13", name: "Planting trees and creepers", naks: plus([15, 18, 23], cls("mridu", "dhruva", "kshipra")) },
      { v: "2.13", name: "Meeting the king or officials", naks: plus(cls("dhruva", "mridu", "kshipra"), [21, 22]) },
      { v: "2.13", name: "Buying or selling cows", naks: plus(cls("kshipra"), [26, 15, 6, 17, 23, 22, 14]) },
      { v: "2.15", name: "First dose of medicine", naks: plus(cls("kshipra", "mridu", "chara"), [18]), okVara: [5, 1, 3, 4, 0], need: "dual-sign lagna; not the patient's janma nakṣatra" },
      { v: "2.15", name: "Sewing; putting on armour", naks: [6, 22, 13, 16, 0] },
      { v: "2.16", name: "Buying", naks: [26, 23, 0, 14, 21, 13] },
      { v: "2.17", name: "Selling", naks: [10, 19, 24, 15, 2, 8, 1] },
      { v: "2.17", name: "Opening a shop", naks: cls("mridu", "dhruva", "kshipra", "chara"), badVara: [2], badClass: [3], need: "not a Kumbha lagna" },
      { v: "2.18", name: "Horses: buying, training", naks: plus(cls("kshipra"), [26, 22, 4, 14, 23, 6]), badVara: [2], badClass: [3] },
      { v: "2.18", name: "Riding horses or elephants", naks: [26, 0, 23, 14, 4, 13, 6, 21, 12, 7, 22], okVara: [4, 1, 5] },
      { v: "2.19", name: "Making ornaments", naks: cls("chara", "kshipra", "dhruva") },
      { v: "2.19", name: "Making weapons", naks: plus(cls("tikshna", "ugra"), [0, 4, 15, 2]) },
      { v: "2.20", name: "Washing clothes", naks: [22, 0, 12, 13, 14, 15, 16, 6, 7], badVara: [6, 3], badClass: [3], badTithi: [6] },
      { v: "2.21", name: "Taking up weapons", naks: plus(cls("mridu", "dhruva", "kshipra"), [6, 17, 15]), okVara: [5, 4, 0], badClass: [3], need: "fixed lagna" },
      { v: "2.21", name: "First use of a bed, seat or sandals", naks: [21, 1, 6, 17] },
      { v: "2.25", name: "Digging wells and tanks", naks: plus(plus([16, 12], cls("dhruva")), [22, 23, 19, 9, 26, 7, 4]), need: "Jupiter or Mercury in lagna, Moon in a watery sign" },
      { v: "2.25", name: "Starting dance", naks: plus(plus([16, 12], cls("dhruva")), [22, 23, 26, 7, 4, 17]) },
      { v: "2.26", name: "Starting service with a master", naks: cls("kshipra", "mridu"), okVara: [0, 3, 4, 5] },
      { v: "2.27", name: "Lending money", naks: plus(plus([14, 6], cls("mridu")), [15, 7, 21, 22, 23, 0]), badVara: [3], need: "chara lagna" },
      { v: "2.28", name: "First ploughing", naks: plus([18, 15, 9], cls("chara", "dhruva", "mridu", "kshipra")), badVara: [0, 6], badClass: [3], badTithi: [8, 6] },
      { v: "2.29", name: "Sowing seed", naks: plus([18, 9], cls("dhruva", "mridu", "kshipra")).concat([14, 22]), badVara: [2], badClass: [3], badTithi: [8, 6] },
      { v: "2.30", name: "Blood-letting", naks: plus([13, 14, 16, 17, 3, 4, 23, 21], cls("kshipra")), okVara: [2, 0, 4] },
      { v: "2.30", name: "Dharma rites (koṭi-homa, mahārudra)", naks: cls("mridu", "kshipra", "chara", "dhruva") },
      { v: "2.31", name: "Harvesting grain", naks: plus(cls("tikshna"), [24, 2, 4, 11, 20, 25, 12, 22, 21, 14, 19, 1, 13, 7]), badVara: [6, 2], badClass: [3], need: "fixed lagna" },
      { v: "2.32", name: "Threshing", naks: [10, 11, 21, 9, 17, 3, 18, 16, 26] },
      { v: "2.32", name: "Transplanting", naks: [15, 24, 18, 3, 23, 11], badVara: [6, 2] },
      { v: "2.33", name: "Storing grain", naks: allBut(plus(cls("mishra", "ugra", "tikshna"), [5])) },
      { v: "2.34", name: "Śānti and pauṣṭika rites", naks: plus(cls("kshipra", "dhruva", "chara", "mridu"), [9]) },
      { v: "2.37", name: "Eating the new grain", naks: cls("chara", "kshipra", "mridu"), badVara: [6, 2], badClass: [0], badMasa: [0, 9] },
      { v: "2.38", name: "Building a boat", naks: allBut([1, 2, 3, 15, 17, 8, 9, 5]), okVara: [5, 4, 0] },
      { v: "2.38", name: "A voyage", naks: [0, 12, 7, 4, 10, 16, 22, 21] },
      { v: "2.40", name: "First bath after illness", naks: allBut(plus(plus([26, 6], cls("dhruva")), [9, 14, 8])), badVara: [5, 1] },
      { v: "2.41", name: "Starting crafts (śilpa)", naks: cls("mridu", "dhruva", "kshipra", "chara") },
      { v: "2.42", name: "Making a treaty or friendship", naks: [7, 16, 10], okTithi: [8, 12] },
      { v: "2.48", name: "Preta-kriya (rites not done at cremation)", naks: [0, 7, 12, 8, 18, 17, 21, 5, 14] },
      { v: "2.61", name: "Pratiṣṭhā (installing images, tanks, gardens)", naks: cls("mridu", "kshipra", "chara", "dhruva"), badVara: [2], badClass: [3], need: "Uttarāyaṇa, śukla pakṣa, Jupiter and Venus visible" },
    ],
    dishashula: ["west", "east", "north", "north", "south", "west", "east"], // 1.37 commentary
    homaMouth: ["Sun (loss of wealth)", "Mercury (growth)", "Venus (success here and hereafter)", "Saturn (fall)", "Moon", "Mars", "Jupiter (success)", "Rāhu (harm)", "Ketu (famine)"],
    homaMouthBad: [0, 3, 5, 7, 8],
    woodDung: [[6, "below / on the ground: tasty food", true], [8, "head: a death", false], [12, "middle: fear of snakes", false], [16, "east: meeting friends", true], [20, "south: illness", false], [24, "west: medicines", true], [28, "north: happiness", true]],
    halaChakra: [[3, false], [11, true], [20, false], [28, true]], // cumulative counts
    phaniChakra: [[8, false], [11, true], [12, false], [15, true], [16, false], [19, true], [20, false], [23, true], [27, false]],

    // ---- Regions -------------------------------------------------------------
    // Estimated modern extent of each region the text names. A place belongs
    // to a region if its nearest district is listed (state: whole state;
    // districts: listed ones) and, if given, lies within the latitude band.
    regions: {
      madhyadesha: { name: "Madhyadeśa", states: ["Delhi", "Haryana", "Uttar Pradesh"], districts: { "Madhya Pradesh": ["Gwalior", "Morena", "Bhind", "Datia", "Shivpuri", "Sheopur", "Guna", "Ashoknagar", "Tikamgarh", "Niwari", "Chhatarpur", "Panna"], "Rajasthan": ["Alwar", "Bharatpur", "Dholpur", "Karauli", "Dausa", "Jaipur"], "Uttarakhand": ["Haridwar", "Udham Singh Nagar"] }, note: "Between the Himālaya and Vindhya, east of Kurukṣetra and west of Prayāga" },
      gauda: { name: "Gauḍa", states: ["West Bengal"], note: "Bengal" },
      malava: { name: "Mālava", districts: { "Madhya Pradesh": ["Indore", "Ujjain", "Dewas", "Ratlam", "Mandsaur", "Neemuch", "Shajapur", "Agar Malwa", "Dhar", "Rajgarh", "Bhopal", "Sehore", "Vidisha", "Raisen", "Jhabua", "Alirajpur"], "Rajasthan": ["Jhalawar", "Pratapgarh"] }, note: "Malwa plateau" },
      huna: { name: "Hūṇa", states: ["Jammu and Kashmir", "Ladakh"], note: "The north-west frontier" },
      vanga: { name: "Vaṅga", states: ["West Bengal", "Tripura"], note: "Bengal" },
      khasha: { name: "Khaśa", states: ["Uttarakhand", "Himachal Pradesh", "Sikkim"], note: "The central Himālayan hills" },
      panjab: { name: "Vipāśā–Irāvatī–Śatadru lands", states: ["Punjab", "Chandigarh"], districts: { "Himachal Pradesh": ["Kangra", "Una", "Hamirpur", "Bilaspur", "Mandi", "Kullu", "Chamba"] }, note: "Punjab" },
      pushkara: { name: "Tripuṣkara (Ajmer)", districts: { "Rajasthan": ["Ajmer"] } },
      gangaGodavari: { name: "Between the Gaṅgā and Godāvarī", latMin: 18.5, latMax: 25.5, lonMin: 72.5, lonMax: 88.5, note: "Estimated as latitude 18.5°–25.5° N" },
      revaGanga: { name: "Between the Revā (Narmadā) and Gaṅgā", latMin: 22.3, latMax: 26.5, lonMin: 72.5, lonMax: 88.5, note: "Estimated as latitude 22.3°–26.5° N" },
      northNarmada: { name: "North of the Narmadā", latMin: 22.3, note: "Estimated as north of latitude 22.3° N" },
      kalinga: { name: "Kaliṅga", states: ["Odisha"] },
      gurjara: { name: "Gurjara", states: ["Gujarat"] },
      konkana: { name: "Koṅkaṇa", states: ["Goa"], districts: { "Maharashtra": ["Mumbai", "Thane", "Palghar", "Raigad", "Ratnagiri", "Sindhudurg"] } },
      magadha: { name: "Magadha", states: ["Bihar"] },
      sindhu: { name: "Sindhu", districts: { "Gujarat": ["Kutch"], "Rajasthan": ["Barmer", "Jaisalmer"] }, note: "Sindh lies outside India; its border districts are used" },
    },
  };

  VedicEngine.MCData = D;
})(typeof window !== "undefined" ? window : globalThis);
