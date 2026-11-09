// The Today Special dialog: the day's tithi and nakṣatra details, activities,
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

  function open(snapshot, data, opts) {
    wire();
    const body = $("ts-body");
    body.textContent = "";
    let sections;
    try {
      sections = VedicEngine.MCYogas.todaySpecial(snapshot, data, opts);
    } catch (err) {
      console.error("Today Special failed:", err);
      sections = [{ title: "Could not work out today's details", sub: "", items: [String(err && err.message || err)] }];
    }
    const day = snapshot.anchors.governingSunrise.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "long", year: "numeric" });
    const intro = document.createElement("p");
    intro.className = "ld-note";
    intro.textContent = "Sunrise to sunrise from " + day + ". From Muhūrta Cintāmaṇi, Prakaraṇas 1–2; verse numbers in brackets.";
    body.appendChild(intro);
    sections.forEach(function (sec, i) {
      const det = document.createElement("details");
      det.className = "ts-sec";
      if (i < 3) det.open = true;
      const sum = document.createElement("summary");
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
      sec.items.forEach(function (it) {
        const li = document.createElement("li");
        li.textContent = it;
        ul.appendChild(li);
      });
      det.appendChild(ul);
      body.appendChild(det);
    });
    $("ts-dialog").classList.remove("hidden");
    $("ts-close").focus();
  }

  VedicEngine.TodaySpecial = { open: open };
})(typeof window !== "undefined" ? window : globalThis);
