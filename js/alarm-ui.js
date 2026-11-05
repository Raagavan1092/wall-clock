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
    play: '<path d="M8.5 5.8v12.4l10-6.2z"/>',
    stop: '<rect x="7" y="7" width="10" height="10" rx="1.8"/>',
    music: '<path d="M9 17.5V6.5l9-2v11"/><circle cx="6.8" cy="17.6" r="2.2"/><circle cx="15.8" cy="15.6" r="2.2"/>',
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
    // Three strikes; `c` may be an OfflineAudioContext (tools/render-sounds.js
    // renders the bell for the Android app with this).
    function strikes(c, t) {
      [0, 1.0, 2.0].forEach(function (dt, i) { strike(c, t + dt, [1, 0.85, 0.7][i]); });
    }
    function phrase() {
      const c = context();
      if (!c) return;
      strikes(c, c.currentTime + 0.05);
    }
    return {
      // One strike, for the dialog's "Preview" - and it unlocks audio, since
      // it runs inside a click.
      preview: function () { const c = context(); if (c) strike(c, c.currentTime + 0.02, 1); },
      unlock: function () { context(); },
      running: function () { return !!ac && ac.state === "running"; },
      strikes: strikes,
      PHRASE_SECONDS: 5.5, // how often the ringing bell repeats its three strikes
      // Rings until stopped (or 90 s, whichever first).
      start: function () {
        this.stop();
        phrase();
        loop = setInterval(phrase, 5500); // = PHRASE_SECONDS
        stopper = setTimeout(function () { Bell.stop(); }, 90000);
      },
      stop: function () { clearInterval(loop); clearTimeout(stopper); loop = stopper = null; },
    };
  })();

  // ---- the person's own track ---------------------------------------------
  // One audio file, kept on this device (IndexedDB - far too big for
  // localStorage), that alarms can play instead of the bell.
  const Track = (function () {
    const DB = "vedicWallClock.sounds", STORE = "files", KEY = "alarmTrack";
    const MAX_BYTES = 25 * 1024 * 1024;
    let audio = null, objectUrl = null, stopper = null;
    const listeners = [];
    function notify() { listeners.forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } }); }

    function open() {
      return new Promise(function (resolve, reject) {
        if (!global.indexedDB) { reject(new Error("This browser cannot store files.")); return; }
        const req = indexedDB.open(DB, 1);
        req.onupgradeneeded = function () { req.result.createObjectStore(STORE); };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error || new Error("Could not open the sound store.")); };
      });
    }
    // Runs `work(store)` in one transaction; resolves with its request's result.
    function run(mode, work) {
      return open().then(function (db) {
        return new Promise(function (resolve, reject) {
          const tx = db.transaction(STORE, mode);
          const req = work(tx.objectStore(STORE));
          tx.oncomplete = function () { db.close(); resolve(req ? req.result : undefined); };
          tx.onerror = tx.onabort = function () { db.close(); reject(tx.error || new Error("Could not save the file.")); };
        });
      });
    }

    function stop() {
      clearTimeout(stopper);
      stopper = null;
      const was = !!audio;
      if (audio) { audio.pause(); audio = null; }
      if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
      if (was) notify();
    }

    return {
      // { name } of the stored track, or null.
      info: function () {
        return run("readonly", function (s) { return s.get(KEY); }).then(function (rec) { return rec ? { name: rec.name } : null; }).catch(function () { return null; });
      },
      // Stores `file` (replacing any earlier one); resolves { name }.
      save: function (file) {
        if (!/^audio\//.test(file.type) && !/\.(mp3|m4a|aac|wav|ogg|oga|opus|flac|weba|webm)$/i.test(file.name)) {
          return Promise.reject(new Error("That is not an audio file."));
        }
        if (file.size > MAX_BYTES) return Promise.reject(new Error("That file is over 25 MB - pick a shorter track."));
        return file.arrayBuffer().then(function (data) {
          return run("readwrite", function (s) { return s.put({ name: file.name, type: file.type || "audio/mpeg", data: data }, KEY); }).then(function () {
            // In the Android app the native alarm plays the track, so it needs its own copy.
            if (global.AndroidAlarms && VedicEngine.AndroidBridge) VedicEngine.AndroidBridge.sendTrack(file.name, data);
          });
        }).then(function () { return { name: file.name }; });
      },
      clear: function () {
        stop();
        if (global.AndroidAlarms && VedicEngine.AndroidBridge) VedicEngine.AndroidBridge.clearTrack();
        return run("readwrite", function (s) { return s.delete(KEY); });
      },
      // Plays it (looping, up to maxMs); resolves true if sound started.
      play: function (loop, maxMs) {
        stop();
        return run("readonly", function (s) { return s.get(KEY); }).then(function (rec) {
          if (!rec) return false;
          objectUrl = URL.createObjectURL(new Blob([rec.data], { type: rec.type }));
          audio = new Audio(objectUrl);
          audio.loop = !!loop;
          stopper = setTimeout(stop, maxMs);
          audio.addEventListener("ended", stop);
          return audio.play().then(function () { notify(); return true; });
        }).catch(function () { stop(); return false; });
      },
      stop: stop,
      onChange: function (fn) { listeners.push(fn); return function () { const i = listeners.indexOf(fn); if (i !== -1) listeners.splice(i, 1); }; },
      playing: function () { return !!audio; },
      looping: function () { return !!audio && audio.loop; },
    };
  })();

  // What an alarm plays: the bell, one of the built-in tunes, or the person's
  // own track. Whatever it is, if it cannot start (no track stored any more,
  // an unknown tune) the bell rings instead of silence. Resolves true if sound
  // actually started - false when the browser is still waiting for a tap
  // before it allows any.
  const Sound = {
    start: function (alarm) {
      const kind = alarm.soundKind || "bell";
      function bell() {
        Bell.start();
        return Promise.resolve(Bell.running());
      }
      if (kind.indexOf("tune:") === 0 && VedicEngine.Tunes.has(kind.slice(5))) {
        VedicEngine.Tunes.start(kind.slice(5), { maxMs: 5 * 60 * 1000 });
        return Promise.resolve(VedicEngine.Tunes.running());
      }
      if (kind === "track") {
        return Track.play(true, 5 * 60 * 1000).then(function (ok) { return ok ? true : bell(); });
      }
      return bell();
    },
    stop: function () { Bell.stop(); Track.stop(); VedicEngine.Tunes.stop(); },
  };

  // Browsers only let a page make sound after the person has touched it
  // once; do that on the first touch so later alarms can ring.
  ["pointerdown", "keydown", "touchend"].forEach(function (type) {
    global.addEventListener(type, function once() {
      Bell.unlock();
      VedicEngine.Tunes.unlock();
      global.removeEventListener(type, once, true);
    }, true);
  });

  // ---- the ringing overlay --------------------------------------------------

  let ringRoot = null;
  let ringList = null;
  let ringNote = null;
  let savedTitle = null;

  function itemLine(item, alarm, at) {
    const start = fmtHM(item.start) + Alarms.dateNote(item.start), end = fmtHM(item.end) + Alarms.dateNote(item.end);
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
    Sound.stop();
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
      Sound.start(alarm).then(function (playing) { if (ringNote) ringNote.hidden = playing; });
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
          h("span", { class: "alarm-row-meta", text: a.triggerText + " · " + (a.repeat === "once" ? "just once" : a.custom ? "every day" : "every time") }),
          h("span", { class: "alarm-row-next", text: nextText })),
        h("div", { class: "alarm-row-actions" },
        h("button", { type: "button", class: "alarm-icon-btn", "aria-label": "Edit " + a.title, title: "Edit", onclick: function (e) { openDialog(a.id, e.currentTarget); } }, icon("edit")),
        h("button", { type: "button", class: "alarm-icon-btn danger", "aria-label": "Delete " + a.title, title: "Delete", onclick: function () { Alarms.remove(a.id); } }, icon("trash")))));
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
      soundKind: editing ? editing.soundKind : "bell",
      notify: editing ? editing.notify : false,
      group: editing && editing.events.length ? Alarms.catalogItem(editing.events[0]).group : groups[0].id,
      query: "",
      // A specific time instead of an event: IST clock time, or ghaṭī + pala after sunrise.
      customOn: !!(editing && editing.custom),
      ckind: editing && editing.custom ? editing.custom.kind : "clock",
      hour: editing && editing.custom && editing.custom.kind === "clock" ? editing.custom.hour : 6,
      minute: editing && editing.custom && editing.custom.kind === "clock" ? editing.custom.minute : 0,
      date: editing && editing.custom && editing.custom.date ? editing.custom.date : "",
      ghati: editing && editing.custom && editing.custom.kind === "ghati" ? editing.custom.ghati : 0,
      pala: editing && editing.custom && editing.custom.kind === "ghati" ? editing.custom.pala : 0,
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
    const soundPanel = h("div", { class: "al-sound-panel" });
    const soundList = h("div", { class: "al-sound-list", role: "radiogroup", "aria-label": "Alarm sound" });
    const fileInput = h("input", { type: "file", accept: "audio/*,.mp3,.m4a,.aac,.wav,.ogg,.opus,.flac", hidden: true, "aria-hidden": "true", tabindex: "-1" });
    const Tunes = VedicEngine.Tunes;
    const stopWatching = []; // unsubscribe functions, run when the dialog closes
    let trackInfo = null; // { name } of the stored track, once known
    let trackMessage = ""; // the last problem choosing a file
    const customToggle = h("button", { type: "button", class: "al-link al-custom-toggle" });
    const customKindEl = h("div", { class: "al-seg", role: "radiogroup", "aria-label": "Time kind" });
    function timeInput(label, max) {
      const input = h("input", { type: "number", class: "al-amount al-time-input", min: "0", max: String(max), step: "1", inputmode: "numeric", "aria-label": label });
      return { input: input, field: h("label", { class: "al-time-field" }, h("span", { text: label }), input) };
    }
    const tHour = timeInput("Hour (0–23)", 23), tMin = timeInput("Minute (0–59)", 59);
    const tGhati = timeInput("Ghaṭī (0–59)", 59), tPala = timeInput("Pala (0–59)", 59);
    const clockRow = h("div", { class: "al-time-row" }, tHour.field, h("span", { class: "al-time-sep", text: ":" }), tMin.field);
    const ghatiRow = h("div", { class: "al-time-row" }, tGhati.field, h("span", { class: "al-time-sep", text: "·" }), tPala.field);
    const customHint = h("p", { class: "al-hint" });
    const dateInput = h("input", { type: "date", class: "al-date-input", "aria-label": "Date (optional)" });
    const dateClear = h("button", { type: "button", class: "al-link", text: "Clear" });
    const dateRow = h("div", { class: "al-date-row" }, h("span", { class: "al-date-label", text: "Date" }), dateInput, dateClear, h("span", { class: "al-sub", text: "Leave empty for every day" }));
    const customPane = h("div", { class: "al-custom-pane" },
      h("div", { class: "al-step" }, h("span", { class: "al-step-n", text: "1" }), "Time of day"),
      customKindEl, clockRow, ghatiRow, customHint, dateRow);
    const repeatNum = h("span", { class: "al-step-n", text: "3" });
    const eventPane = h("div", { class: "al-event-pane" });
    const eventConfig = h("div", { class: "al-event-config" });
    const unitEl = h("div", { class: "al-seg small", role: "radiogroup", "aria-label": "Unit" });
    const presetsEl = h("div", { class: "al-presets" });

    labelInput.value = state.label;
    soundBox.checked = state.sound;
    notifyBox.checked = state.notify;

    // -- helpers --
    function customOf() {
      return state.ckind === "clock"
        ? { kind: "clock", hour: state.hour, minute: state.minute, date: state.date || null }
        : { kind: "ghati", ghati: state.ghati, pala: state.pala, date: state.date || null };
    }
    function whole(v, max) { return typeof v === "number" && isFinite(v) && v >= 0 && v <= max && Math.floor(v) === v; }
    function customValid() {
      return state.ckind === "clock" ? whole(state.hour, 23) && whole(state.minute, 59) : whole(state.ghati, 59) && whole(state.pala, 59);
    }
    function draft() {
      if (state.customOn) {
        return { events: [], custom: customOf(), mode: "start", repeat: state.date ? "once" : state.repeat, label: state.label, sound: state.sound, soundKind: state.soundKind, notify: state.notify };
      }
      return {
        events: Array.from(state.selected), mode: state.mode, offsetValue: state.offsetValue, offsetUnit: state.offsetUnit,
        repeat: state.repeat, label: state.label, sound: state.sound, soundKind: state.soundKind, notify: state.notify,
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

      segmented(repeatEl, state.customOn && state.date ? [["once", "Just once"]] : [["always", state.customOn ? "Every day" : "Every time it occurs"], ["once", "Just once"]], state.repeat, function (r) { state.repeat = r; renderWhen(); schedulePreview(); });
    });

    function renderAlerts() {
      if (global.AndroidAlarms) {
        notifyNote.textContent = "Leaves a notification after it rings";
      } else if (!("Notification" in global)) {
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
      saveBtn.disabled = (state.customOn ? !customValid() : !state.selected.size || !amountValid()) || (state.sound && state.soundKind === "track" && !trackInfo);
    }

    // The sound list: the bell, the person's own track (with its file
    // controls when chosen) and the built-in tunes, each with a preview.
    function trackControls() {
      return h("div", { class: "al-track" },
        h("div", { class: "al-track-file" }, icon("music"), h("span", { class: "al-track-name", text: trackInfo ? trackInfo.name : "No track chosen yet" })),
        h("div", { class: "al-track-actions" },
          h("button", { type: "button", class: "al-link", "data-fk": "track-choose", text: trackInfo ? "Replace…" : "Choose audio file…", onclick: function () { fileInput.click(); } }),
          trackInfo ? h("button", { type: "button", class: "al-link", "data-fk": "track-remove", text: "Remove", onclick: function () {
            Track.clear().then(function () { trackInfo = null; trackMessage = ""; renderSound(); renderFoot(); });
          } }) : null),
        trackMessage ? h("p", { class: "al-track-msg", text: trackMessage })
          : trackInfo ? null : h("p", { class: "al-sub", text: "MP3, M4A, WAV or OGG, up to 25 MB. It is kept on this device and shared by every alarm that uses it." }));
    }
    function soundRow(kind, name, sub) {
      const on = state.soundKind === kind;
      const isTune = kind.indexOf("tune:") === 0;
      const playing = isTune ? Tunes.playing() === kind.slice(5) : kind === "track" ? Track.playing() : false;
      const canPlay = kind !== "track" || !!trackInfo;
      return h("div", { class: "al-sound-row" + (on ? " on" : "") },
        h("button", { type: "button", role: "radio", "aria-checked": String(on), class: "al-sound-pick", "data-fk": "snd:" + kind,
          onclick: function () { state.soundKind = kind; renderSound(); renderFoot(); } },
          h("span", { class: "al-radio" }),
          h("span", { class: "al-chip-text" }, h("span", { class: "al-chip-label", text: name }), sub ? h("span", { class: "al-sub", text: sub }) : null)),
        h("button", { type: "button", class: "al-play" + (playing ? " on" : ""), "data-fk": "play:" + kind, disabled: !canPlay,
          "aria-label": (playing ? "Stop " : "Preview ") + name, title: playing ? "Stop" : "Preview",
          onclick: function () { previewSound(kind); } }, icon(playing ? "stop" : "play")));
    }
    const renderSound = focusKept(function () {
      soundPanel.hidden = !state.sound;
      const scroll = soundList.scrollTop;
      soundList.innerHTML = "";
      soundList.appendChild(soundRow("bell", "Temple bell", "A struck bell, repeating"));
      soundList.appendChild(soundRow("track", "My track", trackInfo ? trackInfo.name : "Your own audio file"));
      if (state.soundKind === "track") soundList.appendChild(trackControls());
      soundList.appendChild(h("h4", { class: "al-section", text: "Tunes" }));
      Tunes.list.forEach(function (t) { soundList.appendChild(soundRow("tune:" + t.id, t.name, t.sub)); });
      soundList.scrollTop = scroll;
    });
    function showSelectedSound() {
      const on = soundList.querySelector(".al-sound-row.on");
      if (on) soundList.scrollTop = Math.max(0, on.offsetTop - soundList.offsetTop - 40);
    }

    const renderCustom = focusKept(function () {
      segmented(customKindEl, [["clock", "Clock time"], ["ghati", "Ghaṭī · Pala"]], state.ckind, function (k) { state.ckind = k; renderAll(); });
      clockRow.hidden = state.ckind !== "clock";
      ghatiRow.hidden = state.ckind !== "ghati";
      [[tHour, state.hour], [tMin, state.minute], [tGhati, state.ghati], [tPala, state.pala]].forEach(function (p) {
        if (document.activeElement !== p[0].input) p[0].input.value = isFinite(p[1]) ? p[1] : "";
      });
      customHint.textContent = state.ckind === "clock"
        ? "24-hour clock, Indian Standard Time. Rings at this time " + (state.date ? "on that date." : "every day.")
        : "Counted from that day's sunrise (a ghaṭī is 24 min, a pala 24 s). Rings at this point of " + (state.date ? "the Vedic day that begins on that date." : "every Vedic day.");
      customPane.classList.toggle("invalid", !customValid());
      if (document.activeElement !== dateInput) dateInput.value = state.date;
      dateClear.hidden = !state.date;
    });
    function renderView() {
      customToggle.textContent = state.customOn ? "← Back to events" : "Or set a specific time…";
      customPane.hidden = !state.customOn;
      eventPane.hidden = state.customOn;
      eventConfig.hidden = state.customOn;
      repeatNum.textContent = state.customOn ? "2" : "3";
    }
    function renderAll() { renderView(); renderCustom(); renderPicker(); renderSelected(); renderWhen(); renderSound(); renderFoot(); schedulePreview(); }

    // -- live preview of when it will actually ring --
    let previewTimer = null, previewToken = 0;
    function schedulePreview() {
      clearTimeout(previewTimer);
      const token = ++previewToken;
      if (state.customOn) {
        if (!customValid()) {
          previewEl.className = "al-preview idle";
          previewEl.textContent = "Enter a valid time.";
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
            if (!found.length) { previewEl.className = "al-preview none"; previewEl.textContent = state.date ? "That moment has already passed (or is more than 2 months away)." : "Could not work out the time."; return; }
            previewEl.className = "al-preview ok";
            previewEl.appendChild(h("div", { class: "al-preview-main" },
              icon("bell"),
              h("div", {},
                h("strong", { text: "Rings " + fmtWhen(found[0].fire, now) + " IST" }),
                h("span", { text: "in " + span(found[0].fire - now) + " · " + found[0].detail }))));
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
        return;
      }
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
              h("span", { text: "in " + span(first.fire - now) + " · " + (first.detail || item.label) + " " + what + " at " + fmtHM(eventTime) + Alarms.dateNote(eventTime) }))));
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
    dateInput.min = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
    dateInput.addEventListener("input", function () { state.date = dateInput.value; renderWhen(); renderCustom(); renderFoot(); schedulePreview(); });
    dateClear.addEventListener("click", function () { state.date = ""; renderWhen(); renderCustom(); renderFoot(); schedulePreview(); });
    customToggle.addEventListener("click", function () { state.customOn = !state.customOn; renderAll(); });
    [["hour", tHour], ["minute", tMin], ["ghati", tGhati], ["pala", tPala]].forEach(function (p) {
      p[1].input.addEventListener("input", function () {
        const v = p[1].input.value;
        state[p[0]] = v === "" ? NaN : Number(v);
        renderFoot(); schedulePreview(); customPane.classList.toggle("invalid", !customValid());
      });
      p[1].input.addEventListener("blur", function () { p[1].input.value = isFinite(state[p[0]]) ? state[p[0]] : ""; });
    });
    labelInput.addEventListener("input", function () { state.label = labelInput.value; });
    soundBox.addEventListener("change", function () { state.sound = soundBox.checked; renderSound(); renderFoot(); });
    fileInput.addEventListener("change", function () {
      const file = fileInput.files && fileInput.files[0];
      fileInput.value = "";
      if (!file) return;
      Track.save(file).then(function (info) {
        trackInfo = info;
        trackMessage = "";
        state.soundKind = "track";
      }).catch(function (err) {
        trackMessage = err.message || "Could not use that file.";
      }).then(function () { renderSound(); renderFoot(); });
    });
    // Plays (or, if already playing, stops) a short preview of one sound.
    function previewSound(kind) {
      Bell.unlock();
      Tunes.unlock();
      if (kind.indexOf("tune:") === 0) {
        const id = kind.slice(5);
        if (Tunes.playing() === id) { Tunes.stop(); return; }
        Track.stop();
        Tunes.start(id, { maxMs: 20000 });
      } else if (kind === "track") {
        if (Track.playing()) { Track.stop(); return; }
        Tunes.stop();
        Track.play(false, 20000).then(function (ok) {
          if (!ok) { trackMessage = "That file would not play - try another."; renderSound(); }
        });
      } else {
        Tunes.stop();
        Track.stop();
        Bell.preview();
      }
    }
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
      stopWatching.forEach(function (fn) { fn(); });
      Track.stop();
      Tunes.stop();
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
            customToggle,
            customPane,
            eventPane),
          h("section", { class: "al-col al-config" },
            eventConfig,
            h("div", { class: "al-step" }, repeatNum, "Repeat"),
            repeatEl,
            h("div", { class: "al-step plain" }, "Alert"),
            h("div", { class: "al-toggles" },
              h("label", { class: "al-toggle", for: "al-sound" }, soundBox, h("span", { class: "al-toggle-track" }),
                h("span", { class: "al-toggle-text" }, h("span", { text: "Sound" }), h("span", { class: "al-sub", text: "Until dismissed" }))),
              h("label", { class: "al-toggle", for: "al-notify" }, notifyBox, h("span", { class: "al-toggle-track" }),
                h("span", { class: "al-toggle-text" }, h("span", { text: "Notification" }), notifyNote))),
            soundPanel,
            labelInput)),
        h("footer", { class: "al-foot" },
          previewEl,
          h("div", { class: "al-actions" },
            h("button", { type: "button", class: "al-btn", text: "Cancel", onclick: close }),
            saveBtn)),
        h("p", { class: "al-fineprint", text: "Alarms follow real time and ring while the clock is open on this device." })));

    eventPane.appendChild(h("div", { class: "al-step" }, h("span", { class: "al-step-n", text: "1" }), "Event"));
    eventPane.appendChild(h("label", { class: "al-search" }, icon("search"), searchInput));
    eventPane.appendChild(tabsEl);
    eventPane.appendChild(h("div", { class: "al-tools" }, toolsHint, selectAllBtn, clearBtn));
    eventPane.appendChild(itemsEl);
    eventConfig.appendChild(h("div", { class: "al-step plain" }, selectedTitle));
    eventConfig.appendChild(selectedEl);
    eventConfig.appendChild(h("div", { class: "al-step" }, h("span", { class: "al-step-n", text: "2" }), "When should it ring?"));
    eventConfig.appendChild(modeEl);
    eventConfig.appendChild(modeHint);
    eventConfig.appendChild(beforeEl);
    soundPanel.appendChild(soundList);
    soundPanel.appendChild(fileInput);

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
    stopWatching.push(Tunes.onChange(function () { if (modal.isConnected) renderSound(); }));
    stopWatching.push(Track.onChange(function () { if (modal.isConnected) renderSound(); }));
    document.body.appendChild(modal);
    renderAlerts();
    renderAll();
    Track.info().then(function (info) { trackInfo = info; renderSound(); renderFoot(); });
    showSelectedSound();
    requestAnimationFrame(function () { modal.classList.add("open"); });
    (editing ? saveBtn : state.customOn ? tHour.input : searchInput).focus();
    // Keep the modal's own scroll areas from scrolling the page behind.
    modal.addEventListener("wheel", function (e) { e.stopPropagation(); }, { passive: true });
  }

  // ---- setup ---------------------------------------------------------------

  function init(options) {
    Alarms.init({ getSettings: options.getSettings, getData: options.getData });
    // In the Android app the native alarm rings (it works with the phone
    // locked); the page must not ring a second time on top of it.
    Alarms.onRing(global.AndroidAlarms ? function () {} : showRing);
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

  VedicEngine.AlarmUI = { init, openDialog, showRing, dismissRing, Bell, Track, Sound, fmtWhen, span, itemLine };
})(typeof window !== "undefined" ? window : globalThis);
