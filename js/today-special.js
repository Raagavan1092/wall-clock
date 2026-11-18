// The Today Details dialog: the day's tithi and nakṣatra details, activities,
// planetary bars and regional notes from Muhūrta Cintāmaṇi
// (mc-yogas.js todaySpecial), for the Vedic day on show.
(function (global) {
  "use strict";

  const VedicEngine = global.VedicEngine = global.VedicEngine || {};
  let wired = false;

  function $(id) { return document.getElementById(id); }

  function close() {
    $("ts-dialog").classList.add("hidden");
    const btn = $("btn-todays-specialities");
    if (btn) btn.focus();
  }

  function wire() {
    if (wired) return;
    wired = true;
    $("ts-close").addEventListener("click", close);
    $("ts-dialog").addEventListener("click", function (e) { if (e.target === $("ts-dialog")) close(); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !$("ts-dialog").classList.contains("hidden")) close();
    });
  }

  // A verse reference in brackets, e.g. "(1.4)", "(Vasiṣṭha, 1.9)",
  // "(1.37 commentary)", "(Prakaraṇa 4, Gocara)" or "(local practice)".
  const REF = /\s*\(((?:[^\s(),]+, )?\d+\.\d+[a-z]?(?:[–-]\d+)?(?:, \d+\.\d+(?:[–-]\d+)?)*(?: commentary)?|Prakaraṇa \d+, [^()]+|local practice)\)/g;
  // One line: the text with its verse references moved to chips at the end.
  function itemNode(it) {
    const text = typeof it === "string" ? it : it.text, refs = [];
    const plain = text.replace(REF, function (m, r) { refs.push(r); return ""; }).replace(/\s+([.,;:])/g, "$1").trim();
    const li = document.createElement("li");
    if (it && it.mark) li.className = "ts-" + it.mark;
    li.appendChild(document.createTextNode(plain));
    refs.filter(function (r, i) { return refs.indexOf(r) === i; }).forEach(function (r) {
      const c = document.createElement("span");
      c.className = "ts-ref";
      c.textContent = r;
      c.title = /^Prakaraṇa|local/.test(r) ? r : "Muhūrta Cintāmaṇi " + r;
      li.appendChild(document.createTextNode(" "));
      li.appendChild(c);
    });
    return li;
  }

  function open(snapshot, data, opts) {
    wire();
    const body = $("ts-body");
    body.textContent = "";
    let sections;
    try {
      sections = VedicEngine.MCYogas.todaySpecial(snapshot, data, opts);
    } catch (err) {
      console.error("Today Details failed:", err);
      sections = [{ title: "Could not work out today's details", sub: "", items: [String(err && err.message || err)] }];
    }
    const day = snapshot.anchors.governingSunrise.toLocaleDateString("en-IN", { timeZone: VedicEngine.Zone.intl(), weekday: "long", day: "numeric", month: "long", year: "numeric" });
    const intro = document.createElement("p");
    intro.className = "ld-note";
    intro.textContent = "Sunrise to sunrise from " + day + ". From Muhūrta Cintāmaṇi, Prakaraṇas 1–2; each line carries its verse number. Open a section for the full reference.";
    body.appendChild(intro);
    sections.forEach(function (sec) {
      const det = document.createElement(sec.lead ? "section" : "details");
      det.className = sec.lead ? "ts-sec ts-lead" : "ts-sec";
      const sum = document.createElement(sec.lead ? "div" : "summary");
      if (sec.lead) sum.className = "ts-lead-head";
      const h = document.createElement("span");
      h.className = "ts-title";
      h.textContent = sec.title;
      sum.appendChild(h);
      if (sec.sub) {
        const sub = document.createElement("span");
        sub.className = "ts-sub";
        sub.textContent = sec.sub;
        sum.appendChild(sub);
      }
      det.appendChild(sum);
      const ul = document.createElement("ul");
      sec.items.forEach(function (it) { ul.appendChild(itemNode(it)); });
      det.appendChild(ul);
      body.appendChild(det);
    });
    $("ts-dialog").classList.remove("hidden");
    $("ts-close").focus();
  }

  VedicEngine.TodaySpecial = { open: open };
})(typeof window !== "undefined" ? window : globalThis);
