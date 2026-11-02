// Everything on screen for alarms (the engine is alarms.js): the "Set Alarm"
// dialog, the saved-alarm list in Settings, the next-alarm chip beside the
// gear, and the full-screen overlay + bell that ring when one goes off.
(function (global) {
  "use strict";

  const VedicEngine = global.VedicEngine = global.VedicEngine || {};
  const Alarms = VedicEngine.Alarms;

  // ---- small helpers ------------------------------------------------------

  const SVG_NS = "http://www.w3.org/2000/svg";

  function h(tag, attrs) {
    const node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      const v = attrs[k];
      if (v == null || v === false) return;
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else if (k.indexOf("on") === 0) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? "" : v);
    });
    for (let i = 2; i < arguments.length; i++) append(node, arguments[i]);
    return node;
  }
  function append(node, child) {
    if (child == null || child === false) return;
    if (Array.isArray(child)) child.forEach(function (c) { append(node, c); });
    else node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
  }

  const ICONS = {
    bell: '<path d="M12 3.2a1 1 0 0 1 1 1v.7a6 6 0 0 1 5 5.9v3.2l1.6 2.6a.9.9 0 0 1-.8 1.4H5.2a.9.9 0 0 1-.8-1.4L6 13.8V10.8a6 6 0 0 1 5-5.9v-.7a1 1 0 0 1 1-1Z"/><path d="M9.6 19.2a2.5 2.5 0 0 0 4.8 0"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-3.9-3.9"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    edit: '<path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3Z"/><path d="m14 7 3 3"/>',
    trash: '<path d="M5 7h14M10 4h4M7 7l.8 12h8.4L17 7M10 11v5M14 11v5"/>',
    x: '<path d="m6 6 12 12M18 6 6 18"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  };
  function icon(name, cls) {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("class", "ai " + (cls || ""));
    svg.setAttribute("aria-hidden", "true");
    svg.innerHTML = ICONS[name];
    return svg;
  }

  // Times are always shown in IST, like the rest of the clock.
  const IST_OFFSET_MS = 5.5 * 3600 * 1000;
  const whenFormat = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  function istDayNumber(ms) { return Math.floor((ms + IST_OFFSET_MS) / 86400000); }
  function fmtHM(ms) {
    const p = {};
    whenFormat.formatToParts(new Date(ms)).forEach(function (x) { p[x.type] = x.value; });
    return p.hour + ":" + p.minute;
  }
  // "Today · 15:12", "Tomorrow · 06:12", "Thu 5 Nov · 15:12".
  function fmtWhen(ms, now) {
    const p = {};
    whenFormat.formatToParts(new Date(ms)).forEach(function (x) { p[x.type] = x.value; });
    const diff = istDayNumber(ms) - istDayNumber(now);
    const day = diff === 0 ? "Today" : diff === 1 ? "Tomorrow" : diff === -1 ? "Yesterday" : p.weekday + " " + p.day + " " + p.month;
    return day + " · " + p.hour + ":" + p.minute;
  }
  // "45 min", "2 h 10 min", "3 d 4 h".
  function span(ms) {
    const mins = Math.round(ms / 60000);
    if (mins < 1) return "under a minute";
    if (mins < 60) return mins + " min";
    const hours = Math.floor(mins / 60);
    if (hours < 24) return hours + " h" + (mins % 60 ? " " + (mins % 60) + " min" : "");
    const days = Math.floor(hours / 24);
    return days + " d" + (hours % 24 ? " " + (hours % 24) + " h" : "");
  }

  // ---- the bell -----------------------------------------------------------

  // A struck-bronze-bell tone from a few inharmonic partials, synthesised so
  // there is no sound file to ship or load offline.
  const Bell = (function () {
    let ac = null, loop = null, stopper = null;
    const PARTIALS = [[0.5, 0.55, 5.5], [1, 1, 4.5], [1.19, 0.45, 3.2], [1.5, 0.4, 2.6], [2, 0.38, 2.2], [2.74, 0.22, 1.4], [3.76, 0.12, 0.9], [5.4, 0.07, 0.6]];
    const FUNDAMENTAL = 523.25;

    function context() {
      if (!ac) {
        const Ctor = global.AudioContext || global.webkitAudioContext;
        if (!Ctor) return null;
        try { ac = new Ctor(); } catch (e) { return null; }
      }
      if (ac.state === "suspended") ac.resume().catch(function () { /* needs a user gesture */ });
      return ac;
    }
    function strike(c, when, volume) {
      PARTIALS.forEach(function (p) {
        const osc = c.createOscillator();
        const gain = c.createGain();
        osc.type = "sine";
        osc.frequency.value = FUNDAMENTAL * p[0];
        gain.gain.setValueAtTime(0, when);
        gain.gain.linearRampToValueAtTime(volume * p[1] * 0.22, when + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.0001, when + p[2]);
        osc.connect(gain).connect(c.destination);
        osc.start(when);
        osc.stop(when + p[2] + 0.1);
      });
    }
    function phrase() {
      const c = context();
      if (!c) return;
      const t = c.currentTime + 0.05;
      [0, 1.0, 2.0].forEach(function (dt, i) { strike(c, t + dt, [1, 0.85, 0.7][i]); });
    }
    return {
      // One strike, for the dialog's "Preview" - and it unlocks audio, since
      // it runs inside a click.
      preview: function () { const c = context(); if (c) strike(c, c.currentTime + 0.02, 1); },
      unlock: function () { context(); },
      running: function () { return !!ac && ac.state === "running"; },
      // Rings until stopped (or 90 s, whichever first).
      start: function () {
        this.stop();
        phrase();
        loop = setInterval(phrase, 5500);
        stopper = setTimeout(function () { Bell.stop(); }, 90000);
      },
      stop: function () { clearInterval(loop); clearTimeout(stopper); loop = stopper = null; },
    };
  })();

  // Browsers only let a page make sound after the person has touched it
  // once; do that on the first touch so later alarms can ring.
  ["pointerdown", "keydown", "touchend"].forEach(function (type) {
    global.addEventListener(type, function once() {
      Bell.unlock();
      global.removeEventListener(type, once, true);
    }, true);
  });

  // ---- the ringing overlay --------------------------------------------------

  let ringRoot = null;
  let ringList = null;
  let ringNote = null;
  let savedTitle = null;

  function itemLine(item, alarm, at) {
    const start = fmtHM(item.start), end = fmtHM(item.end);
    if (item.instant) return alarm.mode === "before" ? "In " + span(item.start - at) + " · at " + start : "Now · " + start;
    if (alarm.mode === "end") return "Ends now · " + end + " (began " + start + ")";
    if (alarm.mode === "before") return "Begins in " + span(item.start - at) + " · at " + start + " – " + end;
    return "Begins now · " + start + " – " + end;
  }

  function onRingKey(e) {
    e.stopPropagation();
    if (e.key === "Escape" || e.key === "Enter" || e.key === " ") { e.preventDefault(); dismissRing(); }
  }

  function dismissRing() {
    if (!ringRoot) return;
    document.removeEventListener("keydown", onRingKey);
    Bell.stop();
    ringRoot.remove();
    ringRoot = ringList = ringNote = null;
    if (savedTitle != null) { document.title = savedTitle; savedTitle = null; }
  }

  function showRing(ev) {
    const alarm = ev.alarm;
    if (!ringRoot) {
      ringList = h("ul", { class: "ring-list" });
      ringNote = h("p", { class: "ring-note", hidden: true, text: "Sound is waiting for a tap - browsers only allow it after you touch the page." });
      const dismiss = h("button", { type: "button", class: "ring-dismiss", text: "Dismiss", onclick: dismissRing });
      ringRoot = h("div", { class: "alarm-ring", role: "alertdialog", "aria-modal": "true", "aria-label": "Alarm" },
        h("div", { class: "ring-glow" }),
        h("div", { class: "ring-card" },
          h("div", { class: "ring-bell" }, icon("bell")),
          h("p", { class: "ring-kicker", text: "Alarm" }),
          ringList, ringNote, dismiss));
      document.addEventListener("keydown", onRingKey);
      ringRoot.addEventListener("pointerdown", function () {
        Bell.unlock();
        ringNote.hidden = true;
      });
      document.body.appendChild(ringRoot);
      dismiss.focus();
    }

    ev.items.forEach(function (item) {
      const entry = Alarms.catalogItem(item.id);
      ringList.appendChild(h("li", { class: "ring-item" + (entry && entry.tone ? " tone-" + entry.tone : "") },
        h("strong", { text: item.label }),
        h("span", { class: "ring-group", text: item.group }),
        h("span", { class: "ring-when", text: itemLine(item, alarm, ev.at) })));
    });
    if (alarm.label) ringList.appendChild(h("li", { class: "ring-label", text: alarm.label }));

    if (savedTitle == null) savedTitle = document.title;
    document.title = "🔔 " + ev.items[0].label;

    if (alarm.sound) {
      Bell.start();
      ringNote.hidden = Bell.running();
    }
    if (alarm.notify && "Notification" in global && Notification.permission === "granted") {
      try {
        const n = new Notification(ev.items[0].label + (ev.items.length > 1 ? " +" + (ev.items.length - 1) : ""), {
          body: itemLine(ev.items[0], alarm, ev.at), tag: alarm.id, requireInteraction: true,
        });
        n.onclick = function () { global.focus(); n.close(); };
      } catch (e) { /* e.g. Android Chrome only allows notifications from a service worker */ }
    }
    if (navigator.vibrate) { try { navigator.vibrate([300, 150, 300, 150, 600]); } catch (e) { /* ignore */ } }
  }

  // ---- the alarm list in Settings and the next-alarm chip ------------------

  let listEl = null;
  let chipEl = null;
  let dialogOpener = null;

  function renderList() {
    if (!listEl) return;
    const now = Date.now();
    const items = Alarms.list();
    listEl.innerHTML = "";
    if (!items.length) {
      listEl.appendChild(h("li", { class: "alarm-empty", text: "No alarms yet. Set one for a tithi, a muhūrta, Rāhu Kālam, sunrise - anything on the dial." }));
      return;
    }
    items.forEach(function (a) {
      let nextText;
      if (!a.enabled) nextText = a.lastRang && a.repeat === "once" ? "Rang " + fmtWhen(a.lastRang, now) : "Off";
      else if (a.next === undefined) nextText = "Working out the next time…";
      else if (a.next === null) nextText = "Not due in the next 2 months";
      else nextText = "Next: " + fmtWhen(a.next.fireAt, now) + " · in " + span(a.next.fireAt - now);

      const toggle = h("button", {
        type: "button", class: "alarm-switch", role: "switch", "aria-checked": String(a.enabled),
        "aria-label": (a.enabled ? "Turn off " : "Turn on ") + a.title,
        onclick: function () { Alarms.setEnabled(a.id, !a.enabled); },
      }, h("span", { class: "alarm-switch-knob" }));
      listEl.appendChild(h("li", { class: "alarm-row" + (a.enabled ? "" : " is-off") },
        toggle,
        h("div", { class: "alarm-row-main" },
          h("strong", { class: "alarm-row-title", text: a.title }),
          h("span", { class: "alarm-row-meta", text: a.triggerText + " · " + (a.repeat === "once" ? "just once" : "every time") }),
          h("span", { class: "alarm-row-next", text: nextText })),
        h("button", { type: "button", class: "alarm-icon-btn", "aria-label": "Edit " + a.title, title: "Edit", onclick: function (e) { openDialog(a.id, e.currentTarget); } }, icon("edit")),
        h("button", { type: "button", class: "alarm-icon-btn danger", "aria-label": "Delete " + a.title, title: "Delete", onclick: function () { Alarms.remove(a.id); } }, icon("trash"))));
    });
  }

  function renderChip() {
    if (!chipEl) return;
    const now = Date.now();
    const upcoming = Alarms.list().filter(function (a) { return a.enabled && a.next; })
      .sort(function (a, b) { return a.next.fireAt - b.next.fireAt; })[0];
    if (!upcoming) { chipEl.hidden = true; return; }
    chipEl.hidden = false;
    chipEl.innerHTML = "";
    chipEl.appendChild(icon("bell"));
    chipEl.appendChild(h("span", { class: "chip-text", text: fmtWhen(upcoming.next.fireAt, now) + " · " + upcoming.title }));
    chipEl.title = "Next alarm in " + span(upcoming.next.fireAt - now) + " - " + upcoming.title + " (" + upcoming.triggerText.toLowerCase() + ")";
  }

  // ---- the Set Alarm dialog -------------------------------------------------

  const PRESETS = [[5, "min"], [10, "min"], [15, "min"], [30, "min"], [1, "hr"], [2, "hr"], [1, "ghati"]];
  const UNIT_NAMES = [["min", "Minutes"], ["hr", "Hours"], ["ghati", "Ghaṭī"]];
  const UNIT_MAX = { min: 7 * 24 * 60, hr: 7 * 24, ghati: 7 * 60 };

  function fold(s) {
    return String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  }

  function openDialog(editId, opener) {
    if (document.querySelector(".alarm-modal")) return;
    dialogOpener = opener || document.activeElement;
    const groups = Alarms.catalog();
    const editing = editId ? Alarms.get(editId) : null;

    const state = {
      selected: new Set(editing ? editing.events : []),
      mode: editing ? editing.mode : "start",
      offsetValue: editing && editing.mode === "before" ? editing.offsetValue : 15,
      offsetUnit: editing ? editing.offsetUnit : "min",
      repeat: editing ? editing.repeat : "always",
      label: editing ? editing.label : "",
      sound: editing ? editing.sound : true,
      notify: editing ? editing.notify : false,
      group: editing && editing.events.length ? Alarms.catalogItem(editing.events[0]).group : groups[0].id,
      query: "",
    };

    // -- pieces that re-render --
    const tabsEl = h("div", { class: "al-tabs", role: "tablist", "aria-label": "Event kind" });
    const itemsEl = h("div", { class: "al-items", role: "group", "aria-label": "Events" });
    const toolsHint = h("span", { class: "al-tools-hint" });
    const selectAllBtn = h("button", { type: "button", class: "al-link", text: "Select all" });
    const clearBtn = h("button", { type: "button", class: "al-link", text: "Clear" });
    const selectedEl = h("div", { class: "al-selected" });
    const selectedTitle = h("span", { text: "Selected" });
    const modeEl = h("div", { class: "al-seg", role: "radiogroup", "aria-label": "When to ring" });
    const modeHint = h("p", { class: "al-hint" });
    const beforeEl = h("div", { class: "al-before" });
    const repeatEl = h("div", { class: "al-seg", role: "radiogroup", "aria-label": "Repeat" });
    const previewEl = h("div", { class: "al-preview", "aria-live": "polite" });
    const saveBtn = h("button", { type: "button", class: "al-btn primary", text: editing ? "Save alarm" : "Set alarm" });
    const searchInput = h("input", { type: "search", class: "al-search-input", placeholder: "Search - Rāhu, Ekādaśī, Rohiṇī, muhūrta…", "aria-label": "Search events", autocomplete: "off", spellcheck: "false" });
    const amountInput = h("input", { type: "number", class: "al-amount", min: "0", step: "any", inputmode: "decimal", "aria-label": "Amount of time before the start" });
    const labelInput = h("input", { type: "text", class: "al-text", maxlength: "60", placeholder: "Label (optional) - e.g. Start Ekādaśī vrata", "aria-label": "Label" });
    const soundBox = h("input", { type: "checkbox", id: "al-sound" });
    const notifyBox = h("input", { type: "checkbox", id: "al-notify" });
    const notifyNote = h("span", { class: "al-sub" });
    const unitEl = h("div", { class: "al-seg small", role: "radiogroup", "aria-label": "Unit" });
    const presetsEl = h("div", { class: "al-presets" });

    labelInput.value = state.label;
    soundBox.checked = state.sound;
    notifyBox.checked = state.notify;

    // -- helpers --
    function draft() {
      return {
        events: Array.from(state.selected), mode: state.mode, offsetValue: state.offsetValue, offsetUnit: state.offsetUnit,
        repeat: state.repeat, label: state.label, sound: state.sound, notify: state.notify,
      };
    }
    function instantOnly() { return Alarms.allInstants(Array.from(state.selected)); }
    function amountValid() { return state.mode !== "before" || (isFinite(state.offsetValue) && state.offsetValue > 0 && state.offsetValue <= UNIT_MAX[state.offsetUnit]); }
    function visibleItems() {
      const q = fold(state.query.trim());
      if (!q) return groups.filter(function (g) { return g.id === state.group; }).reduce(function (acc, g) { return acc.concat(g.items); }, []);
      return groups.reduce(function (acc, g) {
        return acc.concat(g.items.filter(function (it) {
          return fold(it.label + " " + (it.sub || "") + " " + g.title + " " + (it.section || "")).indexOf(q) !== -1;
        }));
      }, []);
    }
    function segmented(container, options, current, onPick) {
      container.innerHTML = "";
      options.forEach(function (o) {
        container.appendChild(h("button", {
          type: "button", role: "radio", "data-fk": "seg:" + container.getAttribute("aria-label") + ":" + o[0], class: "al-seg-btn" + (o[0] === current ? " on" : ""), "aria-checked": String(o[0] === current), text: o[1],
          onclick: function () { onPick(o[0]); },
        }));
      });
    }

    // Re-rendering replaces buttons; put focus back on the same one (by its
    // data-fk key) so keyboard use - Space on a chip, Tab, Esc - keeps working.
    function focusKept(render) {
      return function () {
        const active = document.activeElement;
        const key = active && active.getAttribute && active.getAttribute("data-fk");
        render.apply(null, arguments);
        if (key) {
          const again = modal.querySelector('[data-fk="' + key.replace(/"/g, '\\"') + '"]');
          if (again && again !== document.activeElement) again.focus({ preventScroll: true });
        }
      };
    }

    // -- renderers --
    const renderTabs = focusKept(function () {
      tabsEl.innerHTML = "";
      groups.forEach(function (g) {
        const count = g.items.filter(function (it) { return state.selected.has(it.id); }).length;
        const on = !state.query.trim() && g.id === state.group;
        tabsEl.appendChild(h("button", {
          type: "button", role: "tab", "data-fk": "tab:" + g.id, class: "al-tab" + (on ? " on" : "") + (g.tone ? " tone-" + g.tone : ""), "aria-selected": String(on),
          title: g.hint, onclick: function () { state.group = g.id; if (state.query) { state.query = ""; searchInput.value = ""; } renderPicker(); },
        }, g.title, count ? h("span", { class: "al-tab-count", text: String(count) }) : null));
      });
    });

    const renderItems = focusKept(function () {
      const items = visibleItems();
      itemsEl.innerHTML = "";
      const searching = !!state.query.trim();
      if (!items.length) {
        itemsEl.appendChild(h("p", { class: "al-empty", text: "Nothing matches “" + state.query.trim() + "”." }));
      }
      // Sub-headings: a group's own sections, or (when searching) its title.
      let lastHeading = null, grid = null;
      items.forEach(function (it) {
        const heading = searching ? it.groupTitle : it.section;
        if (heading !== lastHeading || !grid) {
          if (heading) itemsEl.appendChild(h("h4", { class: "al-section", text: heading }));
          grid = h("div", { class: "al-grid" + (items.some(function (x) { return x.sub && x.sub.length > 12; }) ? " wide" : "") });
          itemsEl.appendChild(grid);
          lastHeading = heading;
        }
        const on = state.selected.has(it.id);
        grid.appendChild(h("button", {
          type: "button", "data-fk": "chip:" + it.id, class: "al-chip" + (on ? " on" : "") + (it.tone ? " tone-" + it.tone : ""), "aria-pressed": String(on),
          onclick: function () {
            if (state.selected.has(it.id)) state.selected.delete(it.id); else state.selected.add(it.id);
            renderAll();
          },
        }, h("span", { class: "al-check" }, icon("check")),
        h("span", { class: "al-chip-text" }, h("span", { class: "al-chip-label", text: searching ? it.label : (it.short || it.label) }), it.sub ? h("span", { class: "al-sub", text: it.sub }) : null)));
      });
      const allOn = items.length > 0 && items.every(function (it) { return state.selected.has(it.id); });
      toolsHint.textContent = searching ? items.length + " found" : groups.filter(function (g) { return g.id === state.group; })[0].hint;
      selectAllBtn.disabled = !items.length || allOn;
      selectAllBtn.textContent = searching ? "Select these" : "Select all";
      clearBtn.disabled = !state.selected.size;
      clearBtn.textContent = "Clear (" + state.selected.size + ")";
    });

    function renderPicker() { renderTabs(); renderItems(); }

    const renderSelected = focusKept(function () {
      selectedEl.innerHTML = "";
      selectedTitle.textContent = state.selected.size ? "Selected · " + state.selected.size : "Selected";
      if (!state.selected.size) {
        selectedEl.appendChild(h("p", { class: "al-placeholder", text: "Pick one or more events on the left." }));
        return;
      }
      const ids = Array.from(state.selected);
      ids.slice(0, 8).forEach(function (id) {
        const it = Alarms.catalogItem(id);
        selectedEl.appendChild(h("span", { class: "al-pill" + (it.tone ? " tone-" + it.tone : "") },
          h("span", { text: it.label }),
          h("button", { type: "button", "aria-label": "Remove " + it.label, onclick: function () { state.selected.delete(id); renderAll(); } }, icon("x"))));
      });
      if (ids.length > 8) selectedEl.appendChild(h("span", { class: "al-pill more", text: "+" + (ids.length - 8) + " more" }));
    });

    const renderWhen = focusKept(function () {
      const instant = instantOnly();
      if (instant && state.mode === "end") state.mode = "start";
      const options = instant
        ? [["start", "At the moment"], ["before", "Before"]]
        : [["start", "At the start"], ["end", "At the end"], ["before", "Before the start"]];
      segmented(modeEl, options, state.mode, function (m) { state.mode = m; renderAll(); });
      modeHint.textContent = state.mode === "before"
        ? (instant ? "A heads-up before it happens." : "A heads-up before it begins.")
        : state.mode === "end" ? "Rings when it ends." : (instant ? "Rings at that exact moment." : "Rings when it begins.");

      beforeEl.hidden = state.mode !== "before";
      segmented(unitEl, UNIT_NAMES, state.offsetUnit, function (u) { state.offsetUnit = u; renderWhen(); schedulePreview(); renderFoot(); });
      presetsEl.innerHTML = "";
      PRESETS.forEach(function (p) {
        const on = state.offsetValue === p[0] && state.offsetUnit === p[1];
        presetsEl.appendChild(h("button", {
          type: "button", "data-fk": "preset:" + p[0] + p[1], class: "al-preset" + (on ? " on" : ""), "aria-pressed": String(on), text: p[0] + " " + Alarms.UNIT_LABEL[p[1]],
          onclick: function () { state.offsetValue = p[0]; state.offsetUnit = p[1]; renderWhen(); schedulePreview(); renderFoot(); },
        }));
      });
      if (document.activeElement !== amountInput) amountInput.value = isFinite(state.offsetValue) ? state.offsetValue : "";
      amountInput.max = String(UNIT_MAX[state.offsetUnit]);
      amountInput.classList.toggle("invalid", !amountValid());

      segmented(repeatEl, [["always", "Every time it occurs"], ["once", "Just once"]], state.repeat, function (r) { state.repeat = r; renderWhen(); schedulePreview(); });
    });

    function renderAlerts() {
      if (!("Notification" in global)) {
        notifyBox.disabled = true;
        notifyNote.textContent = "Not supported here";
      } else if (Notification.permission === "denied") {
        notifyBox.disabled = true;
        notifyBox.checked = false;
        state.notify = false;
        notifyNote.textContent = "Blocked by the browser";
      } else {
        notifyNote.textContent = "Even from another tab";
      }
    }

    function renderFoot() {
      saveBtn.disabled = !state.selected.size || !amountValid();
    }

    function renderAll() { renderPicker(); renderSelected(); renderWhen(); renderFoot(); schedulePreview(); }

    // -- live preview of when it will actually ring --
    let previewTimer = null, previewToken = 0;
    function schedulePreview() {
      clearTimeout(previewTimer);
      const token = ++previewToken;
      if (!state.selected.size || !amountValid()) {
        previewEl.className = "al-preview idle";
        previewEl.textContent = state.selected.size ? "Enter how long before the start." : "Choose an event to see when it will ring.";
        return;
      }
      previewEl.className = "al-preview busy";
      previewEl.textContent = "Working out when this rings…";
      previewTimer = setTimeout(function () {
        const d = draft();
        Alarms.preview(d, d.repeat === "once" ? 1 : 3).then(function (found) {
          if (token !== previewToken) return;
          const now = Date.now();
          previewEl.innerHTML = "";
          if (!found.length) {
            previewEl.className = "al-preview none";
            previewEl.textContent = "That event does not occur in the next 2 months.";
            return;
          }
          previewEl.className = "al-preview ok";
          const first = found[0];
          const item = Alarms.catalogItem(first.id);
          const instant = item.instant;
          const what = d.mode === "end" ? "ends" : instant ? "happens" : "begins";
          const eventTime = d.mode === "end" ? first.end : first.start;
          previewEl.appendChild(h("div", { class: "al-preview-main" },
            icon("bell"),
            h("div", {},
              h("strong", { text: "Rings " + fmtWhen(first.fire, now) + " IST" }),
              h("span", { text: "in " + span(first.fire - now) + " · " + (first.detail || item.label) + " " + what + " at " + fmtHM(eventTime) }))));
          if (found.length > 1) {
            previewEl.appendChild(h("p", { class: "al-preview-then" }, "Then " + found.slice(1).map(function (f) { return fmtWhen(f.fire, now); }).join("  ·  ")));
          }
        }).catch(function (err) {
          if (token !== previewToken) return;
          console.error(err);
          previewEl.className = "al-preview none";
          previewEl.textContent = "Could not work out the time.";
        });
      }, 160);
    }

    // -- inputs --
    searchInput.addEventListener("input", function () { state.query = searchInput.value; renderPicker(); });
    selectAllBtn.addEventListener("click", function () { visibleItems().forEach(function (it) { state.selected.add(it.id); }); renderAll(); });
    clearBtn.addEventListener("click", function () { state.selected.clear(); renderAll(); });
    amountInput.addEventListener("input", function () {
      state.offsetValue = amountInput.value === "" ? NaN : Number(amountInput.value);
      renderWhen(); renderFoot(); schedulePreview();
    });
    amountInput.addEventListener("blur", function () { amountInput.value = isFinite(state.offsetValue) ? state.offsetValue : ""; });
    labelInput.addEventListener("input", function () { state.label = labelInput.value; });
    soundBox.addEventListener("change", function () { state.sound = soundBox.checked; });
    notifyBox.addEventListener("change", function () { state.notify = notifyBox.checked; });

    function nudge(dir) {
      const step = state.offsetUnit === "min" && (state.offsetValue >= 15 || dir > 0 && state.offsetValue >= 10) ? 5 : 1;
      const base = isFinite(state.offsetValue) ? state.offsetValue : 0;
      state.offsetValue = Math.max(1, Math.min(UNIT_MAX[state.offsetUnit], Math.round((base + dir * step) * 100) / 100));
      renderWhen(); renderFoot(); schedulePreview();
    }

    function onKey(e) {
      if (!modal.isConnected || document.querySelector(".alarm-ring")) return;
      e.stopPropagation(); // the clock's own arrow/space shortcuts must not fire from in here
      if (e.key === "Escape") { e.preventDefault(); close(); return; }
      if (e.key !== "Tab") return;
      const focusable = Array.from(modal.querySelectorAll("button, input, [href], select, textarea, [tabindex]:not([tabindex='-1'])"))
        .filter(function (n) { return !n.disabled && n.offsetParent !== null; });
      if (!focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      const inside = modal.contains(document.activeElement);
      if (!inside || (e.shiftKey && document.activeElement === first)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }

    function close() {
      document.removeEventListener("keydown", onKey);
      clearTimeout(previewTimer);
      previewToken++;
      modal.classList.add("closing");
      setTimeout(function () { modal.remove(); }, 160);
      if (dialogOpener && dialogOpener.focus && document.contains(dialogOpener)) dialogOpener.focus();
    }

    saveBtn.addEventListener("click", function () {
      if (saveBtn.disabled) return;
      Bell.unlock(); // this click is the gesture that lets alarms sound later
      if (state.notify && "Notification" in global && Notification.permission === "default") {
        try { Notification.requestPermission(); } catch (e) { /* ignore */ }
      }
      const d = draft();
      if (editing) Alarms.update(editing.id, d); else Alarms.add(d);
      close();
    });

    const modal = h("div", { class: "alarm-modal", role: "dialog", "aria-modal": "true", "aria-labelledby": "al-title" },
      h("div", { class: "al-backdrop", onclick: close }),
      h("div", { class: "al-card" },
        h("header", { class: "al-head" },
          h("div", { class: "al-head-icon" }, icon("bell")),
          h("div", { class: "al-head-text" },
            h("h2", { id: "al-title", text: editing ? "Edit alarm" : "Set alarm" }),
            h("p", { text: "Be alerted to any event on the clock - when it begins, when it ends, or ahead of time." })),
          h("button", { type: "button", class: "al-x", "aria-label": "Close", onclick: close }, icon("x"))),
        h("div", { class: "al-body" },
          h("section", { class: "al-col al-pick" },
            h("div", { class: "al-step" }, h("span", { class: "al-step-n", text: "1" }), "Event"),
            h("label", { class: "al-search" }, icon("search"), searchInput),
            tabsEl,
            h("div", { class: "al-tools" }, toolsHint, selectAllBtn, clearBtn),
            itemsEl),
          h("section", { class: "al-col al-config" },
            h("div", { class: "al-step plain" }, selectedTitle),
            selectedEl,
            h("div", { class: "al-step" }, h("span", { class: "al-step-n", text: "2" }), "When should it ring?"),
            modeEl, modeHint,
            beforeEl,
            h("div", { class: "al-step" }, h("span", { class: "al-step-n", text: "3" }), "Repeat"),
            repeatEl,
            h("div", { class: "al-step plain" }, "Alert"),
            h("div", { class: "al-toggles" },
              h("label", { class: "al-toggle", for: "al-sound" }, soundBox, h("span", { class: "al-toggle-track" }),
                h("span", { class: "al-toggle-text" }, h("span", { text: "Bell sound" }),
                  h("button", { type: "button", class: "al-link al-sub", text: "Preview", onclick: function (e) { e.preventDefault(); e.stopPropagation(); Bell.preview(); } }))),
              h("label", { class: "al-toggle", for: "al-notify" }, notifyBox, h("span", { class: "al-toggle-track" }),
                h("span", { class: "al-toggle-text" }, h("span", { text: "Notification" }), notifyNote))),
            labelInput)),
        h("footer", { class: "al-foot" },
          previewEl,
          h("div", { class: "al-actions" },
            h("button", { type: "button", class: "al-btn", text: "Cancel", onclick: close }),
            saveBtn)),
        h("p", { class: "al-fineprint", text: "Alarms follow real time and ring while the clock is open on this device." })));

    // The "before" amount row, built once and shown only for "Before".
    beforeEl.appendChild(h("div", { class: "al-before-row" },
      h("div", { class: "al-stepper" },
        h("button", { type: "button", "aria-label": "Less", text: "−", onclick: function () { nudge(-1); } }),
        amountInput,
        h("button", { type: "button", "aria-label": "More", text: "+", onclick: function () { nudge(1); } })),
      unitEl,
      h("span", { class: "al-before-word", text: "before" })));
    beforeEl.appendChild(presetsEl);

    document.addEventListener("keydown", onKey);
    document.body.appendChild(modal);
    renderAlerts();
    renderAll();
    requestAnimationFrame(function () { modal.classList.add("open"); });
    (editing ? saveBtn : searchInput).focus();
    // Keep the modal's own scroll areas from scrolling the page behind.
    modal.addEventListener("wheel", function (e) { e.stopPropagation(); }, { passive: true });
  }

  // ---- setup ---------------------------------------------------------------

  function init(options) {
    Alarms.init({ getSettings: options.getSettings, getData: options.getData });
    Alarms.onRing(showRing);
    listEl = document.getElementById("alarm-list");
    chipEl = document.getElementById("next-alarm");
    const setBtn = document.getElementById("alarm-set");
    if (setBtn) setBtn.addEventListener("click", function (e) { openDialog(null, e.currentTarget); });
    if (chipEl) chipEl.addEventListener("click", function () { if (options.onChipClick) options.onChipClick(); });
    function refresh() { renderList(); renderChip(); }
    Alarms.onChange(refresh);
    refresh();
    // Keep "in 2 h 10 min" honest.
    setInterval(refresh, 20000);
  }

  VedicEngine.AlarmUI = { init, openDialog, showRing, dismissRing, Bell, fmtWhen, span };
})(typeof window !== "undefined" ? window : globalThis);
