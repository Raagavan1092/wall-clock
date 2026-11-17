// The Today panel (app.html #today-panel): the date and vāra, sunrise and sunset, the
// day's tithi / nakṣatra / yoga / karaṇa / māsa with when each ends, the good and bad
// windows running now and coming next, and what the outer ring is showing.
// app.js builds a plain model every tick (it has the snapshot); this file only draws
// it, and only when something in it has changed.
//
// model: {
//   date, vara, sun,
//   rows: [{ k, v, till }],
//   nowTitle, now: [{ kind: "bad" | "good" | "next" | "none", text, when }],
//   ring: { name, next } | null,
// }
(function (global) {
  "use strict";

  const VedicEngine = global.VedicEngine = global.VedicEngine || {};
  let lastKey = "";

  function $(id) { return document.getElementById(id); }
  function h(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function update(model) {
    const key = JSON.stringify(model);
    if (key === lastKey) return;
    lastKey = key;
    if (!$("today-panel")) return;

    $("tp-date").textContent = model.date;
    $("tp-vara").textContent = model.vara;
    $("tp-sun").textContent = model.sun;

    const rows = $("tp-rows");
    rows.textContent = "";
    model.rows.forEach(function (r) {
      const row = h("div", "tp-row");
      row.appendChild(h("dt", null, r.k));
      const dd = h("dd");
      dd.appendChild(h("span", "tp-val", r.v));
      if (r.till) dd.appendChild(h("span", "tp-till", r.till));
      row.appendChild(dd);
      rows.appendChild(row);
    });

    $("tp-now-title").textContent = model.nowTitle;
    const now = $("tp-now");
    now.textContent = "";
    model.now.forEach(function (n) {
      const li = h("li", "tp-" + n.kind);
      li.appendChild(h("span", "tp-dot"));
      li.appendChild(h("span", "tp-val", n.text));
      if (n.when) li.appendChild(h("span", "tp-till", n.when));
      now.appendChild(li);
    });

    $("tp-ring").hidden = !model.ring;
    if (model.ring) {
      $("tp-ring-name").textContent = model.ring.name;
      $("tp-ring-next").textContent = model.ring.next || "";
    }
  }

  VedicEngine.TodayPanel = { update: update };
})(typeof window !== "undefined" ? window : globalThis);
