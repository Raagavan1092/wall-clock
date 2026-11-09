// A date picker in the clock's own dark-and-gold look, used instead of the
// browser's native one (which ignores the theme). One at a time:
//   DatePicker.open({ value: "YYYY-MM-DD", title: "Pick a date", onPick: fn(value), onCancel: fn() })
// Dates are plain calendar dates ("YYYY-MM-DD"); the caller decides the time zone.
(function (global) {
  "use strict";

  const VedicEngine = global.VedicEngine = global.VedicEngine || {};
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  let root = null, state = null, lastFocus = null;

  function pad(n) { return String(n).padStart(2, "0"); }
  function fmt(y, m, d) { return y + "-" + pad(m + 1) + "-" + pad(d); }
  function parse(v) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || "");
    return m ? { y: +m[1], m: +m[2] - 1, d: +m[3] } : null;
  }
  // Today's date in IST, the clock's time zone.
  function todayIST() {
    const t = new Date(Date.now() + 5.5 * 3600000);
    return fmt(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
  }
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function build() {
    root = el("div", "dp-overlay");
    root.hidden = true;
    root.innerHTML =
      '<div class="dp-card" role="dialog" aria-modal="true" aria-labelledby="dp-title">' +
      '<div class="dp-title" id="dp-title"></div>' +
      '<div class="dp-head">' +
      '<button type="button" class="dp-nav" data-step="-12" aria-label="Previous year">«</button>' +
      '<button type="button" class="dp-nav" data-step="-1" aria-label="Previous month">‹</button>' +
      '<div class="dp-month" aria-live="polite"></div>' +
      '<button type="button" class="dp-nav" data-step="1" aria-label="Next month">›</button>' +
      '<button type="button" class="dp-nav" data-step="12" aria-label="Next year">»</button>' +
      '</div>' +
      '<div class="dp-grid" role="grid"></div>' +
      '<div class="dp-foot"><button type="button" class="dp-today">Today</button><span></span><button type="button" class="dp-cancel">Cancel</button></div>' +
      '</div>';
    document.body.appendChild(root);
    root.addEventListener("click", function (e) {
      if (e.target === root) { cancel(); return; }
      const nav = e.target.closest(".dp-nav");
      if (nav) { shift(+nav.dataset.step); return; }
      const day = e.target.closest(".dp-day");
      if (day && !day.disabled) { pick(day.dataset.value); return; }
      if (e.target.closest(".dp-today")) { const t = parse(todayIST()); state.y = t.y; state.m = t.m; state.focus = todayIST(); render(); return; }
      if (e.target.closest(".dp-cancel")) cancel();
    });
    root.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cancel(); return; }
      const keys = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
      if (keys[e.key] && e.target.closest(".dp-day")) {
        e.preventDefault();
        const p = parse(e.target.dataset.value);
        const t = new Date(Date.UTC(p.y, p.m, p.d + keys[e.key]));
        state.y = t.getUTCFullYear(); state.m = t.getUTCMonth();
        state.focus = fmt(state.y, state.m, t.getUTCDate());
        render();
      }
    });
  }

  function shift(months) {
    const t = new Date(Date.UTC(state.y, state.m + months, 1));
    state.y = t.getUTCFullYear(); state.m = t.getUTCMonth();
    state.focus = null;
    render();
  }

  function render() {
    root.querySelector(".dp-title").textContent = state.title;
    root.querySelector(".dp-month").textContent = MONTHS[state.m] + " " + state.y;
    const grid = root.querySelector(".dp-grid");
    grid.textContent = "";
    DAYS.forEach(function (d) { grid.appendChild(el("div", "dp-dow", d)); });
    const first = new Date(Date.UTC(state.y, state.m, 1)).getUTCDay();
    const count = new Date(Date.UTC(state.y, state.m + 1, 0)).getUTCDate();
    for (let i = 0; i < first; i++) grid.appendChild(el("div", "dp-blank"));
    const today = todayIST();
    let focusBtn = null;
    for (let d = 1; d <= count; d++) {
      const v = fmt(state.y, state.m, d);
      const b = el("button", "dp-day", String(d));
      b.type = "button";
      b.dataset.value = v;
      if (v === state.value) b.classList.add("is-selected");
      if (v === today) b.classList.add("is-today");
      if (state.marked && state.marked.indexOf(v) !== -1) b.classList.add("is-marked");
      if ((state.min && v < state.min) || (state.max && v > state.max)) b.disabled = true;
      b.tabIndex = -1;
      grid.appendChild(b);
      if (v === state.focus || (!focusBtn && v === state.value)) focusBtn = b;
    }
    const target = focusBtn || grid.querySelector(".dp-day:not(:disabled)");
    if (target) { target.tabIndex = 0; target.focus(); }
  }

  function close() {
    root.hidden = true;
    const s = state;
    state = null;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
    return s;
  }
  function pick(v) { const s = close(); if (s && s.onPick) s.onPick(v); }
  function cancel() { const s = close(); if (s && s.onCancel) s.onCancel(); }

  // opts: { value, title, min, max, marked: ["YYYY-MM-DD"], onPick, onCancel }
  function open(opts) {
    if (!root) build();
    if (state) cancel();
    const start = parse(opts.value) || parse(todayIST());
    state = {
      y: start.y, m: start.m, value: opts.value || null, focus: opts.value || null,
      title: opts.title || "Pick a date", min: opts.min || null, max: opts.max || null, marked: opts.marked || null,
      onPick: opts.onPick, onCancel: opts.onCancel,
    };
    lastFocus = document.activeElement;
    root.hidden = false;
    render();
  }

  VedicEngine.DatePicker = { open: open, todayIST: todayIST, isOpen: function () { return !!state; } };
})(typeof window !== "undefined" ? window : globalThis);
