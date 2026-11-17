// The script names are shown in (Settings > Script for names): IAST (as stored),
// Devanāgarī, Kannada or Tamil. Display only: every name stays IAST in the data,
// in ids and in whatever is matched by text; VedicEngine.Script.name() is applied
// where a name is drawn (the dial's labels and tooltips' titles, the centre's
// window lines, the Today panel, the ring buttons).
//
// Devanāgarī and Kannada are exact letter-for-letter transliterations of IAST.
// Tamil has no letters for the aspirated and voiced stops, and a Tamil pañcāṅga
// has its own names (Pūrva Phalgunī is Pūram), so the common names come from the
// TAMIL table below and anything else is transliterated by sound.
(function (global) {
  "use strict";

  const VedicEngine = global.VedicEngine = global.VedicEngine || {};

  const SCRIPTS = { iast: "IAST (Latin)", deva: "Devanāgarī", kn: "Kannada", ta: "Tamil" };

  // IAST letters, longest first where one is the start of another.
  const VOWELS = ["ai", "au", "a", "ā", "i", "ī", "u", "ū", "ṛ", "ṝ", "ḷ", "e", "o"];
  const CONSONANTS = ["kh", "gh", "ch", "jh", "ṭh", "ḍh", "th", "dh", "ph", "bh",
    "k", "g", "ṅ", "c", "j", "ñ", "ṭ", "ḍ", "ṇ", "t", "d", "n", "p", "b", "m", "y", "r", "l", "v", "ś", "ṣ", "s", "h"];

  function table(keys, values) {
    const out = {};
    keys.forEach(function (k, i) { out[k] = values[i]; });
    return out;
  }
  const V_ORDER = ["a", "ā", "i", "ī", "u", "ū", "ṛ", "ṝ", "ḷ", "e", "ai", "o", "au"];
  const C_ORDER = ["k", "kh", "g", "gh", "ṅ", "c", "ch", "j", "jh", "ñ", "ṭ", "ṭh", "ḍ", "ḍh", "ṇ", "t", "th", "d", "dh", "n", "p", "ph", "b", "bh", "m", "y", "r", "l", "v", "ś", "ṣ", "s", "h"];

  const ABUGIDAS = {
    deva: {
      vowel: table(V_ORDER, ["अ", "आ", "इ", "ई", "उ", "ऊ", "ऋ", "ॠ", "ऌ", "ए", "ऐ", "ओ", "औ"]),
      sign: table(V_ORDER, ["", "ा", "ि", "ी", "ु", "ू", "ृ", "ॄ", "ॢ", "े", "ै", "ो", "ौ"]),
      cons: table(C_ORDER, ["क", "ख", "ग", "घ", "ङ", "च", "छ", "ज", "झ", "ञ", "ट", "ठ", "ड", "ढ", "ण", "त", "थ", "द", "ध", "न", "प", "फ", "ब", "भ", "म", "य", "र", "ल", "व", "श", "ष", "स", "ह"]),
      virama: "्", anusvara: "ं", visarga: "ः",
    },
    kn: {
      vowel: table(V_ORDER, ["ಅ", "ಆ", "ಇ", "ಈ", "ಉ", "ಊ", "ಋ", "ೠ", "ಌ", "ಏ", "ಐ", "ಓ", "ಔ"]),
      sign: table(V_ORDER, ["", "ಾ", "ಿ", "ೀ", "ು", "ೂ", "ೃ", "ೄ", "ೢ", "ೇ", "ೈ", "ೋ", "ೌ"]),
      cons: table(C_ORDER, ["ಕ", "ಖ", "ಗ", "ಘ", "ಙ", "ಚ", "ಛ", "ಜ", "ಝ", "ಞ", "ಟ", "ಠ", "ಡ", "ಢ", "ಣ", "ತ", "ಥ", "ದ", "ಧ", "ನ", "ಪ", "ಫ", "ಬ", "ಭ", "ಮ", "ಯ", "ರ", "ಲ", "ವ", "ಶ", "ಷ", "ಸ", "ಹ"]),
      virama: "್", anusvara: "ಂ", visarga: "ಃ",
      // Kannada writes a nasal before a stop of its own class as an anusvāra (ಪಂಚಮೀ, ಚಂದ್ರ).
      nasalAsAnusvara: true,
    },
    ta: {
      vowel: table(V_ORDER, ["அ", "ஆ", "இ", "ஈ", "உ", "ஊ", "ரு", "ரூ", "லு", "ஏ", "ஐ", "ஓ", "ஔ"]),
      sign: table(V_ORDER, ["", "ா", "ி", "ீ", "ு", "ூ", "ிரு", "ிரூ", "்லு", "ே", "ை", "ோ", "ௌ"]),
      // No aspirates or voiced stops; ś as ச, the Grantha letters for j, ṣ, s and h.
      cons: table(C_ORDER, ["க", "க", "க", "க", "ங", "ச", "ச", "ஜ", "ஜ", "ஞ", "ட", "ட", "ட", "ட", "ண", "த", "த", "த", "த", "ன", "ப", "ப", "ப", "ப", "ம", "ய", "ர", "ல", "வ", "ச", "ஷ", "ஸ", "ஹ"]),
      virama: "்", anusvara: "ம்", visarga: "ஃ",
      tamil: true,
    },
  };

  // Which class nasal goes before which stops.
  const NASAL_CLASS = { "ṅ": "k kh g gh", "ñ": "c ch j jh", "ṇ": "ṭ ṭh ḍ ḍh", "n": "t th d dh", "m": "p ph b bh" };
  const TAMIL_NASAL = { k: "ங்", kh: "ங்", g: "ங்", gh: "ங்", c: "ஞ்", ch: "ஞ்", j: "ஞ்", jh: "ஞ்", "ṭ": "ண்", "ṭh": "ண்", "ḍ": "ண்", "ḍh": "ண்", t: "ந்", th: "ந்", d: "ந்", dh: "ந்" };

  // One lower-case IAST word -> [{ t: "v" | "c" | "m", k: letter }]; a character that is
  // not an IAST letter is kept as { t: "x", k: char }.
  function tokens(word) {
    const out = [];
    let i = 0;
    while (i < word.length) {
      const two = word.substr(i, 2), one = word[i];
      if (CONSONANTS.indexOf(two) !== -1) { out.push({ t: "c", k: two }); i += 2; }
      else if (VOWELS.indexOf(two) !== -1) { out.push({ t: "v", k: two }); i += 2; }
      else if (CONSONANTS.indexOf(one) !== -1) { out.push({ t: "c", k: one }); i++; }
      else if (VOWELS.indexOf(one) !== -1) { out.push({ t: "v", k: one }); i++; }
      else if (one === "ṃ" || one === "ṁ") { out.push({ t: "m", k: "ṃ" }); i++; }
      else if (one === "ḥ") { out.push({ t: "m", k: "ḥ" }); i++; }
      else { out.push({ t: "x", k: one }); i++; }
    }
    return out;
  }

  function wordTo(word, A) {
    const tk = tokens(word.normalize("NFC").toLowerCase());
    let out = "";
    for (let i = 0; i < tk.length; i++) {
      const cur = tk[i], next = tk[i + 1], prev = tk[i - 1];
      if (cur.t === "v") {
        out += prev && prev.t === "c" ? A.sign[cur.k] : A.vowel[cur.k];
      } else if (cur.t === "c") {
        const stopNext = next && next.t === "c" ? next.k : null;
        if (A.nasalAsAnusvara && NASAL_CLASS[cur.k] && stopNext && NASAL_CLASS[cur.k].split(" ").indexOf(stopNext) !== -1) { out += A.anusvara; continue; }
        let letter = A.cons[cur.k];
        if (A.tamil) {
          // Dental ந at the start of a word and before a dental; ன elsewhere.
          if (cur.k === "n" && (!prev || (stopNext && "t th d dh".split(" ").indexOf(stopNext) !== -1))) letter = "ந";
          // kṣ is the conjunct க்ஷ; śr is written ஸ்ர.
          if (cur.k === "ś" && stopNext === "r") letter = "ஸ";
        }
        out += letter;
        if (!next || next.t !== "v") out += A.virama;
      } else if (cur.t === "m") {
        if (cur.k === "ḥ") out += A.visarga;
        else if (A.tamil) out += (next && next.t === "c" && TAMIL_NASAL[next.k]) || A.anusvara;
        else out += A.anusvara;
      } else {
        out += cur.k;
      }
    }
    return out;
  }

  // The few English words in the dial's labels, as the Sanskrit to show in their place.
  const ENGLISH = { first: "prathama", second: "dvitīya", third: "tṛtīya", fourth: "caturtha", night: "rātri", day: "dina" };

  // Tamil: the names a Tamil pañcāṅga uses, by lower-case IAST phrase or word.
  const TAMIL = {
    // vāra
    "ravivāra": "ஞாயிறு", "somavāra": "திங்கள்", "maṅgalavāra": "செவ்வாய்", "budhavāra": "புதன்", "guruvāra": "வியாழன்", "śukravāra": "வெள்ளி", "śanivāra": "சனி",
    // tithi
    "pratipadā": "பிரதமை", "dvitīyā": "துவிதியை", "tṛtīyā": "திருதியை", "caturthī": "சதுர்த்தி", "pañcamī": "பஞ்சமி", "ṣaṣṭhī": "சஷ்டி", "saptamī": "சப்தமி", "aṣṭamī": "அஷ்டமி",
    "navamī": "நவமி", "daśamī": "தசமி", "ekādaśī": "ஏகாதசி", "dvādaśī": "துவாதசி", "trayodaśī": "திரயோதசி", "caturdaśī": "சதுர்த்தசி", "pūrṇimā": "பௌர்ணமி", "amāvāsyā": "அமாவாசை",
    "śukla": "சுக்ல", "kṛṣṇa": "கிருஷ்ண",
    // nakṣatra
    "aśvinī": "அசுவினி", "bharaṇī": "பரணி", "kṛttikā": "கார்த்திகை", "rohiṇī": "ரோகிணி", "mṛgaśīrṣa": "மிருகசீரிஷம்", "ārdrā": "திருவாதிரை", "punarvasu": "புனர்பூசம்", "puṣya": "பூசம்",
    "āśleṣā": "ஆயில்யம்", "maghā": "மகம்", "pūrva phalgunī": "பூரம்", "uttara phalgunī": "உத்திரம்", "hasta": "ஹஸ்தம்", "citrā": "சித்திரை", "svātī": "சுவாதி", "viśākhā": "விசாகம்",
    "anurādhā": "அனுஷம்", "jyeṣṭhā": "கேட்டை", "mūla": "மூலம்", "pūrva āṣāḍhā": "பூராடம்", "uttara āṣāḍhā": "உத்திராடம்", "śravaṇa": "திருவோணம்", "dhaniṣṭhā": "அவிட்டம்", "śatabhiṣā": "சதயம்",
    "pūrva bhādrapadā": "பூரட்டாதி", "uttara bhādrapadā": "உத்திரட்டாதி", "revatī": "ரேவதி",
    // rāśi
    "meṣa": "மேஷம்", "vṛṣabha": "ரிஷபம்", "mithuna": "மிதுனம்", "karka": "கடகம்", "siṃha": "சிம்மம்", "kanyā": "கன்னி", "tulā": "துலாம்", "vṛścika": "விருச்சிகம்", "dhanu": "தனுசு", "makara": "மகரம்", "kumbha": "கும்பம்", "mīna": "மீனம்",
    // yoga
    "viṣkambha": "விஷ்கம்பம்", "prīti": "ப்ரீதி", "āyuṣmān": "ஆயுஷ்மான்", "saubhāgya": "சௌபாக்யம்", "śobhana": "சோபனம்", "atigaṇḍa": "அதிகண்டம்", "sukarmā": "சுகர்மம்", "dhṛti": "திருதி", "śūla": "சூலம்",
    "gaṇḍa": "கண்டம்", "vṛddhi": "விருத்தி", "dhruva": "துருவம்", "vyāghāta": "வியாகாதம்", "harṣaṇa": "ஹர்ஷணம்", "vajra": "வஜ்ரம்", "siddhi": "சித்தி", "vyatīpāta": "வியதீபாதம்", "varīyān": "வரீயான்",
    "parigha": "பரிகம்", "śiva": "சிவம்", "siddha": "சித்தம்", "sādhya": "சாத்தியம்", "śubha": "சுபம்", "brahma": "பிரம்மம்", "indra": "இந்திரம்", "vaidhṛti": "வைதிருதி",
    // karaṇa
    "bava": "பவம்", "bālava": "பாலவம்", "kaulava": "கௌலவம்", "taitila": "தைதுலம்", "garaja": "கரசை", "vaṇija": "வணிசை", "viṣṭi": "பத்திரை", "śakuni": "சகுனி", "catuṣpada": "சதுஷ்பாதம்", "nāga": "நாகவம்", "kiṃstughna": "கிம்ஸ்துக்னம்",
    // māsa
    "caitra": "சைத்ரம்", "vaiśākha": "வைசாகம்", "jyeṣṭha": "ஜ்யேஷ்டம்", "āṣāḍha": "ஆஷாடம்", "śrāvaṇa": "சிராவணம்", "bhādrapada": "பாத்ரபதம்", "āśvina": "ஆச்வினம்", "kārttika": "கார்த்திகம்",
    "mārgaśīrṣa": "மார்கசீர்ஷம்", "pauṣa": "பௌஷம்", "māgha": "மாகம்", "phālguna": "பால்குனம்",
    // graha (horā)
    "sūrya": "சூரியன்", "candra": "சந்திரன்", "maṅgala": "செவ்வாய்", "budha": "புதன்", "guru": "குரு", "śukra": "சுக்கிரன்", "śani": "சனி",
    // the rings, the windows and the marker lines
    "tithi": "திதி", "nakṣatra": "நட்சத்திரம்", "yoga": "யோகம்", "yogam": "யோகம்", "karaṇa": "கரணம்", "lagna": "லக்னம்", "muhūrta": "முகூர்த்தம்", "yāma": "யாமம்", "kāla": "காலம்", "kālam": "காலம்",
    "horā": "ஓரை", "māsa": "மாதம்", "vāra": "கிழமை", "rāhu": "ராகு", "maraṇa": "மரண", "amṛta": "அமிர்த", "viṣa": "விஷ", "abhijit": "அபிஜித்", "pradoṣa": "பிரதோஷம்", "bhadrā": "பத்ரா", "kulika": "குளிகை",
    "saṅkrānti": "சங்கராந்தி", "niśītha": "நிசீதம்", "aruṇodaya": "அருணோதயம்", "candrodaya": "சந்திரோதயம்", "candrāsta": "சந்திராஸ்தமனம்",
    "prathama": "முதல்", "dvitīya": "இரண்டாம்", "tṛtīya": "மூன்றாம்", "caturtha": "நான்காம்", "rātri": "இரவு", "dina": "பகல்",
  };

  let current = "iast";
  const cache = new Map();

  function set(script) {
    current = SCRIPTS[script] ? script : "iast";
    cache.clear();
  }
  function get() { return current; }

  function isWordChar(ch) { return /[A-Za-zÀ-ɏḀ-ỿ]/.test(ch); }

  // A run of words (no brackets or other punctuation in it).
  function phrase(text, A) {
    const lower = text.normalize("NFC").toLowerCase();
    if (A.tamil && TAMIL[lower.trim()]) return text.replace(text.trim(), TAMIL[lower.trim()]);
    // Word by word, keeping the spaces and hyphens between them.
    return text.split(/([\s\-]+)/).map(function (word) {
      if (!word || !isWordChar(word[0])) return word;
      const key = word.normalize("NFC").toLowerCase();
      const sanskrit = ENGLISH[key] || key;
      if (A.tamil && TAMIL[sanskrit]) return TAMIL[sanskrit];
      return wordTo(sanskrit, A);
    }).join("");
  }

  // A name (or a label made of names: "Caturthī (śukla)", "First Yāma (night)",
  // "Bhadrā +1") in the chosen script. Digits and punctuation are kept as they are.
  function name(text) {
    if (current === "iast" || !text) return text;
    const hit = cache.get(text);
    if (hit !== undefined) return hit;
    const A = ABUGIDAS[current];
    // Split at anything that is not a letter, a space or a hyphen between letters.
    const out = String(text).normalize("NFC").split(/([^A-Za-zÀ-ɏḀ-ỿ\s\-]+)/).map(function (part, i) {
      return i % 2 ? part : phrase(part, A);
    }).join("");
    cache.set(text, out);
    return out;
  }

  VedicEngine.Script = { SCRIPTS: SCRIPTS, set: set, get: get, name: name };
})(typeof window !== "undefined" ? window : globalThis);
