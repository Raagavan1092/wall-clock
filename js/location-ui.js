// The Location & time widget (the pin button in the top row shows it in the
// second row) and its Change location dialog. Owns everything about choosing a
// place: search, My location, recent places, Set as default and Reset. app.js
// hands in the few things it needs (settings, the clock, day navigation).
(function (global) {
  "use strict";

  const E = global.VedicEngine = global.VedicEngine || {};
  const SHOWN_KEY = "vedicWallClock.locWidget";
  const RECENT_KEY = "vedicWallClock.recentLocations.v1";
  const MAX_RECENT = 4;
  const IST_OFFSET_MS = 5.5 * 3600 * 1000;
  const SVGNS = "http://www.w3.org/2000/svg";

  const $ = function (id) { return document.getElementById(id); };
  const near = function (a, b) { return Math.abs(a - b) < 1e-4; };
  const fmtCoords = function (lat, lon) { return lat + "°N, " + lon + "°E"; };
  function dms(lat, lon) {
    return Math.abs(lat).toFixed(2) + "° " + (lat < 0 ? "S" : "N") + " · " + Math.abs(lon).toFixed(2) + "° " + (lon < 0 ? "W" : "E");
  }
  function istHours(date) {
    return (((date.getTime() + IST_OFFSET_MS) % 86400000) + 86400000) % 86400000 / 3600000;
  }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function hhmm(date) { const h = istHours(date); return pad(Math.floor(h)) + ":" + pad(Math.floor(h % 1 * 60)); }

  // ---- place naming ------------------------------------------------------
  function placeAt(lat, lon) {
    return E.IndiaPlaces.PLACES.filter(function (q) { return near(q.latitude, lat) && near(q.longitude, lon); })[0] || null;
  }
  // { name, sub } for a coordinate: a known place, the saved default, or a custom point.
  function describe(lat, lon) {
    const p = placeAt(lat, lon);
    if (p) {
      return { name: p.kind === "district" ? p.name + " (district)" : p.name, short: p.name, sub: (p.kind === "town" && p.district ? p.district + " district, " : "") + p.state };
    }
    const d = E.Settings.defaultLocation();
    if (near(d.latitude, lat) && near(d.longitude, lon)) return { name: d.name, short: d.name, sub: fmtCoords(lat, lon) };
    return { name: "Custom location", short: "Custom location", sub: fmtCoords(lat, lon) };
  }

  // ---- recent places -----------------------------------------------------
  function readRecent() {
    try {
      const a = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
      return (Array.isArray(a) ? a : []).filter(function (r) {
        return r && isFinite(r.latitude) && Math.abs(r.latitude) <= 90 && isFinite(r.longitude) && Math.abs(r.longitude) <= 180 && isFinite(r.elevation) && r.elevation >= 0;
      }).map(function (r) { return { name: String(r.name || "").slice(0, 80), latitude: +r.latitude, longitude: +r.longitude, elevation: +r.elevation }; }).slice(0, MAX_RECENT);
    } catch (e) { return []; }
  }
  function writeRecent(list) {
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch (e) { /* storage unavailable */ }
  }
  function pushRecent(loc) {
    const list = readRecent().filter(function (r) { return !(near(r.latitude, loc.latitude) && near(r.longitude, loc.longitude)); });
    list.unshift({ name: loc.name, latitude: loc.latitude, longitude: loc.longitude, elevation: loc.elevation });
    writeRecent(list.slice(0, MAX_RECENT));
  }

  // ---- the sky arc -------------------------------------------------------
  // Day from sunrise to sunset as an arc, the night as a line either side, hours
  // 0-24 ticked along the whole thing. Same drawing as the design's E artboard.
  const ARC = { r: 120, base: 170, left: 10, right: 452 };
  function arcGeometry(sr, ss) {
    const k = (ARC.right - ARC.left - 2 * ARC.r) / (sr + 24 - ss);
    const srX = ARC.left + sr * k, cx = srX + ARC.r, ssX = cx + ARC.r;
    return { k: k, srX: srX, cx: cx, ssX: ssX };
  }
  const f1 = function (n) { return Math.round(n * 10) / 10; };

  function el(name, attrs, text) {
    const n = document.createElementNS(SVGNS, name);
    Object.keys(attrs || {}).forEach(function (a) { n.setAttribute(a, attrs[a]); });
    if (text != null) n.textContent = text;
    return n;
  }

  function init(api) {
    const widget = $("loc-widget"), toggle = $("loc-toggle"), stage = $("stage");
    const chip = $("loc-chip"), chipName = $("loc-chip-name"), coordsEl = $("loc-coords");
    const menu = $("loc-menu"), recentBox = $("loc-recent"), changeBtn = $("loc-change");
    const arc = $("loc-arc");
    const nowBtn = $("loc-now"), dateInput = $("loc-date-input");

    const dlg = $("loc-dialog"), card = dlg.querySelector(".ld-card");
    const closeBtn = $("loc-close"), cancelBtn = $("loc-cancel"), applyBtn = $("loc-apply");
    const defaultBtn = $("loc-default"), resetBtn = $("loc-reset"), geoBtn = $("loc-geo");
    const search = $("loc-search"), results = $("loc-results"), note = $("loc-note");
    const latIn = $("loc-lat"), lonIn = $("loc-lon"), elevIn = $("loc-elev");
    const curName = $("loc-current-name"), curSub = $("loc-current-sub");

    // First visit: nothing saved yet, so the dialog opens at once and cannot be
    // dismissed until a place is applied (that first place becomes the default).
    let locked = E.Settings.needsLocation();

    // ================= widget =================
    // On unless switched off: the widget stands in for the time slider row.
    let shown = true;
    try { shown = localStorage.getItem(SHOWN_KEY) !== "0"; } catch (e) { /* storage unavailable */ }

    function setShown(on, persist) {
      shown = on;
      widget.hidden = !on;
      toggle.setAttribute("aria-pressed", String(on));
      toggle.classList.toggle("on", on);
      document.body.classList.toggle("loc-on", on);
      if (!on) closeMenu();
      if (persist) { try { localStorage.setItem(SHOWN_KEY, on ? "1" : "0"); } catch (e) { /* storage unavailable */ } }
      if (on) update();
    }
    toggle.addEventListener("click", function () { setShown(!shown, true); });

    // ---- place menu (recent places + Change location…)
    function menuOpen() { return !menu.hidden; }
    function openMenu() {
      renderRecent();
      menu.hidden = false;
      chip.setAttribute("aria-expanded", "true");
      chip.classList.add("open");
    }
    function closeMenu() {
      menu.hidden = true;
      chip.setAttribute("aria-expanded", "false");
      chip.classList.remove("open");
    }
    chip.addEventListener("click", function () { if (menuOpen()) closeMenu(); else openMenu(); });
    document.addEventListener("pointerdown", function (e) {
      if (menuOpen() && !menu.contains(e.target) && !chip.contains(e.target)) closeMenu();
    });
    widget.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && menuOpen()) { e.stopPropagation(); closeMenu(); chip.focus(); }
    });

    function renderRecent() {
      const cur = api.getSettings().location;
      let list = readRecent();
      // The place on show is always listed, even before anything has been picked.
      if (!list.some(function (r) { return near(r.latitude, cur.latitude) && near(r.longitude, cur.longitude); })) {
        list.unshift({ name: describe(cur.latitude, cur.longitude).name, latitude: cur.latitude, longitude: cur.longitude, elevation: cur.elevation });
        list = list.slice(0, MAX_RECENT);
      }
      recentBox.textContent = "";
      list.forEach(function (r) {
        const selected = near(r.latitude, cur.latitude) && near(r.longitude, cur.longitude);
        const b = document.createElement("button");
        b.type = "button";
        b.setAttribute("role", "menuitemradio");
        b.setAttribute("aria-checked", String(selected));
        b.className = "lm-item" + (selected ? " sel" : "");
        const txt = document.createElement("span");
        txt.className = "lm-text";
        const n = document.createElement("span");
        n.className = "lm-name";
        n.textContent = r.name || describe(r.latitude, r.longitude).name;
        const c = document.createElement("span");
        c.className = "lm-sub";
        c.textContent = dms(r.latitude, r.longitude);
        txt.appendChild(n);
        txt.appendChild(c);
        b.appendChild(txt);
        if (selected) {
          const tick = el("svg", { viewBox: "0 0 24 24", "aria-hidden": "true", "class": "lm-tick" });
          tick.appendChild(el("path", { d: "M5 12.5l4.5 4.5L19 7" }));
          b.appendChild(tick);
        }
        b.addEventListener("click", function () {
          closeMenu();
          if (!selected) api.setLocation(r);
          pushRecent(r);
          update();
        });
        recentBox.appendChild(b);
      });
    }
    changeBtn.addEventListener("click", function () { closeMenu(); openDialog(); });

    // ---- day navigation, same actions as the buttons above
    $("loc-prev").addEventListener("click", function () { api.shiftDay(-1); });
    $("loc-next").addEventListener("click", function () { api.shiftDay(1); });
    nowBtn.addEventListener("click", function () { api.goLive(); });
    dateInput.addEventListener("change", function () { api.pickDate(dateInput.value); });

    // ---- the arc
    let arcKey = null, sunEls = null;
    function buildArc(sr, ss) {
      const g = arcGeometry(sr, ss);
      arc.textContent = "";
      const R = ARC.r, base = ARC.base;
      arc.appendChild(el("line", { x1: ARC.left, y1: base, x2: f1(g.srX), y2: base, stroke: "#4b5b80", "stroke-width": 5, "stroke-linecap": "round" }));
      arc.appendChild(el("line", { x1: f1(g.ssX), y1: base, x2: ARC.right, y2: base, stroke: "#4b5b80", "stroke-width": 5, "stroke-linecap": "round" }));
      arc.appendChild(el("line", { x1: f1(g.srX), y1: base, x2: f1(g.ssX), y2: base, stroke: "#3a3020", "stroke-width": 1, "stroke-dasharray": "3 5" }));
      arc.appendChild(el("path", { d: "M" + f1(g.srX) + " " + base + " A" + R + " " + R + " 0 0 1 " + f1(g.ssX) + " " + base, fill: "none", stroke: "#f2b01e", "stroke-width": 6, "stroke-linecap": "round" }));
      const onArc = function (h, rad) {
        const th = Math.PI * (1 - (h - sr) / (ss - sr));
        return { x: g.cx + rad * Math.cos(th), y: base - rad * Math.sin(th) };
      };
      for (let h = 0; h <= 24; h++) {
        const major = h % 3 === 0, color = major ? "#a08a5c" : "#5c4e33", w = major ? 2 : 1.2;
        if (h > sr && h < ss) {
          const a = onArc(h, R + 6), b = onArc(h, R + (major ? 15 : 11));
          arc.appendChild(el("line", { x1: f1(a.x), y1: f1(a.y), x2: f1(b.x), y2: f1(b.y), stroke: color, "stroke-width": w, "stroke-linecap": "round" }));
          if (major) { const c = onArc(h, R + 26); arc.appendChild(el("text", { x: f1(c.x), y: f1(c.y), fill: "#c9b78f", "font-size": 11, "text-anchor": "middle", "dominant-baseline": "middle" }, String(h))); }
        } else {
          const x = h < sr ? ARC.left + h * g.k : g.ssX + (h - ss) * g.k;
          const nc = major ? "#6f80a8" : "#46527a";
          arc.appendChild(el("line", { x1: f1(x), y1: 176, x2: f1(x), y2: major ? 185 : 181, stroke: nc, "stroke-width": w, "stroke-linecap": "round" }));
          if (major) arc.appendChild(el("text", { x: f1(x), y: 196, fill: "#8f9cc0", "font-size": 11, "text-anchor": "middle", "dominant-baseline": "middle" }, String(h)));
        }
      }
      [g.srX, g.ssX].forEach(function (x) { arc.appendChild(el("circle", { cx: f1(x), cy: base, r: 4, fill: "#16130e", stroke: "#e8c77a", "stroke-width": 2 })); });
      arc.appendChild(el("path", { d: "M30 146a9 9 0 1 0 10 12a7 7 0 0 1-10-12z", fill: "none", stroke: "#7d8db3", "stroke-width": 1.6, "stroke-linejoin": "round" }));
      arc.appendChild(el("path", { d: "M424 146a9 9 0 1 0 10 12a7 7 0 0 1-10-12z", fill: "none", stroke: "#7d8db3", "stroke-width": 1.6, "stroke-linejoin": "round" }));
      const srT = el("text", { x: f1(g.srX + 12), y: 152, fill: "#b3a586", "font-size": 12, "text-anchor": "start" });
      const ssT = el("text", { x: f1(g.ssX - 12), y: 152, fill: "#b3a586", "font-size": 12, "text-anchor": "end" });
      arc.appendChild(srT);
      arc.appendChild(ssT);
      const glow = el("circle", { r: 14, fill: "#f2b01e", opacity: 0.18 });
      const sun = el("circle", { r: 8, fill: "#fff4dc", stroke: "#f2b01e", "stroke-width": 3 });
      arc.appendChild(glow);
      arc.appendChild(sun);
      const time = el("text", { x: 232, y: 108, fill: "#f2b01e", "font-size": 34, "font-weight": 700, "text-anchor": "middle" });
      const hm = el("tspan", {});
      const sec = el("tspan", { "font-size": 20, fill: "#c9a24a" });
      time.appendChild(hm);
      time.appendChild(sec);
      const date = el("text", { x: 232, y: 130, fill: "#b3a586", "font-size": 13, "text-anchor": "middle" });
      arc.appendChild(time);
      arc.appendChild(date);
      const c12 = sr < 12 && ss > 12 ? onArc(12, ARC.r + 26) : { x: g.cx };
      nowBtn.style.left = (c12.x / 464 * 100).toFixed(2) + "%";
      sunEls = { g: g, sr: sr, ss: ss, onArc: onArc, glow: glow, sun: sun, hm: hm, sec: sec, date: date, srT: srT, ssT: ssT };
    }

    // ---- drag the sun (or use the arrow keys): it snaps to the hour ticks
    arc.setAttribute("tabindex", "0");
    arc.setAttribute("role", "slider");
    arc.setAttribute("aria-valuemin", "0");
    arc.setAttribute("aria-valuemax", "24");
    // The time under the pointer, to the minute. Within 3 minutes of an hour tick
    // (day or night alike) it sticks to that tick; anywhere else any minute can be picked.
    const SNAP_MIN = 3;
    function hourAt(clientX, clientY) {
      const S = sunEls;
      if (!S) return null;
      const r = arc.getBoundingClientRect();
      const x = (clientX - r.left) * 464 / r.width, y = 14 + (clientY - r.top) * 190 / r.height;
      let h;
      if (x <= S.g.srX) { h = (x - ARC.left) / S.g.k; }
      else if (x >= S.g.ssX) { h = S.ss + (x - S.g.ssX) / S.g.k; }
      else {
        const dx = x - S.g.cx, dy = ARC.base - y;
        const th = dy < 0 ? (dx < 0 ? Math.PI : 0) : Math.atan2(dy, dx);
        h = S.sr + (1 - th / Math.PI) * (S.ss - S.sr);
      }
      h = Math.max(0, Math.min(24, h));
      const tick = Math.round(h);
      if (Math.abs(h - tick) * 60 <= SNAP_MIN) return tick;
      return Math.round(h * 60) / 60;
    }
    let dragging = false, lastHour = null;
    function dragTo(e) {
      const h = hourAt(e.clientX, e.clientY);
      if (h == null || h === lastHour) return;
      lastHour = h;
      api.setTimeOfDay(h);
    }
    arc.addEventListener("pointerdown", function (e) {
      if (e.button) return;
      dragging = true;
      lastHour = null;
      try { arc.setPointerCapture(e.pointerId); } catch (err) { /* not capturable */ }
      dragTo(e);
    });
    arc.addEventListener("pointermove", function (e) { if (dragging) dragTo(e); });
    ["pointerup", "pointercancel", "lostpointercapture"].forEach(function (t) {
      arc.addEventListener(t, function () { dragging = false; });
    });
    arc.addEventListener("keydown", function (e) {
      const k = e.key;
      if (["ArrowLeft", "ArrowDown", "ArrowRight", "ArrowUp", "Home", "End"].indexOf(k) === -1) return;
      e.preventDefault();
      const h = istHours(api.getNow());
      let t;
      if (k === "Home") t = 0;
      else if (k === "End") t = 24;
      else if (e.shiftKey) t = Math.round(h * 60) / 60 + ((k === "ArrowLeft" || k === "ArrowDown") ? -1 : 1) / 60;
      else if (k === "ArrowLeft" || k === "ArrowDown") t = Math.ceil(h - 1e-9) - 1;
      else t = Math.floor(h + 1e-9) + 1;
      api.setTimeOfDay(Math.max(0, Math.min(24, t)));
    });

    let lastLabel = "";
    function update() {
      if (!shown) return;
      const loc = api.getSettings().location;
      chipName.textContent = describe(loc.latitude, loc.longitude).short;
      coordsEl.textContent = dms(loc.latitude, loc.longitude);

      const now = api.getNow();
      const anchors = api.getAnchors();
      let sr = 6, ss = 18, srD = null, ssD = null;
      if (anchors) {
        srD = anchors.governingSunrise; ssD = anchors.sunsetToday;
        const a = istHours(srD), b = istHours(ssD);
        if (isFinite(a) && isFinite(b) && b - a > 6 && b - a < 18) { sr = a; ss = b; }
      }
      const key = f1(sr * 60) + "|" + f1(ss * 60);
      if (key !== arcKey || !sunEls) { arcKey = key; buildArc(sr, ss); }

      const h = istHours(now), S = sunEls, base = ARC.base;
      let pos;
      if (h >= sr && h <= ss) {
        pos = S.onArc(h, ARC.r);
      } else {
        pos = { x: h < sr ? ARC.left + h * S.g.k : S.g.ssX + (h - ss) * S.g.k, y: base };
      }
      [S.glow, S.sun].forEach(function (c) { c.setAttribute("cx", f1(pos.x)); c.setAttribute("cy", f1(pos.y)); });
      const t = now.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: false });
      S.hm.textContent = t.slice(0, 5);
      S.sec.textContent = t.slice(5);
      S.date.textContent = now.toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", year: "numeric" });
      S.srT.textContent = srD ? "↑ " + hhmm(srD) : "";
      S.ssT.textContent = ssD ? hhmm(ssD) + " ↓" : "";
      arc.setAttribute("aria-valuenow", String(Math.round(h * 100) / 100));
      arc.setAttribute("aria-valuetext", t.slice(0, 5));
      const label = "Time of day: drag, or use arrow keys (Shift for minutes). Day from sunrise " + (srD ? hhmm(srD) : "") + " to sunset " + (ssD ? hhmm(ssD) : "") + ". Now " + t.slice(0, 5) + ".";
      if (label !== lastLabel) { lastLabel = label; arc.setAttribute("aria-label", label); }

      const live = api.isLive();
      nowBtn.classList.toggle("is-live", live);
      nowBtn.setAttribute("aria-pressed", String(live));
      const istDate = new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
      if (dateInput.value !== istDate && document.activeElement !== dateInput) dateInput.value = istDate;
    }

    // ================= dialog =================
    let activeIdx = -1, listed = [], chosenName = null, lastFocus = null;

    function setNote(text) { note.textContent = text; note.hidden = !text; }

    function hideResults() {
      results.hidden = true;
      search.setAttribute("aria-expanded", "false");
      search.removeAttribute("aria-activedescendant");
      activeIdx = -1;
    }
    function setActive(i) {
      const rows = results.querySelectorAll("li[data-i]");
      if (!rows.length) return;
      activeIdx = (i + rows.length) % rows.length;
      rows.forEach(function (li, k) {
        li.classList.toggle("active", k === activeIdx);
        li.setAttribute("aria-selected", k === activeIdx ? "true" : "false");
      });
      search.setAttribute("aria-activedescendant", rows[activeIdx].id);
      rows[activeIdx].scrollIntoView({ block: "nearest" });
    }
    function showResults() {
      const q = search.value;
      results.textContent = "";
      listed = E.IndiaPlaces.search(q, 12);
      if (!q.trim()) { hideResults(); return; }
      if (!listed.length) {
        const li = document.createElement("li");
        li.className = "empty";
        li.textContent = "No match - try another spelling";
        results.appendChild(li);
      }
      const lat = parseFloat(latIn.value), lon = parseFloat(lonIn.value);
      listed.forEach(function (p, i) {
        const li = document.createElement("li");
        li.id = "loc-opt-" + i;
        li.setAttribute("role", "option");
        li.dataset.i = i;
        const main = document.createElement("span");
        main.className = "pr-main";
        const name = document.createElement("span");
        name.className = "pr-name";
        name.textContent = p.name;
        const sub = document.createElement("span");
        sub.className = "pr-sub";
        sub.textContent = (p.kind === "district" ? "District" : p.district ? "Town in " + p.district + " district" : "Town") + " · " + p.state;
        main.appendChild(name);
        main.appendChild(sub);
        const meta = document.createElement("span");
        meta.className = "pr-meta";
        meta.textContent = p.elevation + " m";
        li.appendChild(main);
        li.appendChild(meta);
        li.setAttribute("aria-selected", String(near(p.latitude, lat) && near(p.longitude, lon)));
        // mousedown (not click) so it runs before the input loses focus
        li.addEventListener("mousedown", function (ev) { ev.preventDefault(); choose(p); });
        results.appendChild(li);
      });
      results.hidden = false;
      search.setAttribute("aria-expanded", "true");
      if (listed.length) setActive(0);
    }
    function choose(p) {
      latIn.value = p.latitude;
      lonIn.value = p.longitude;
      elevIn.value = p.elevation;
      chosenName = null;
      search.value = p.name;
      hideResults();
      setNote("");
      refresh();
    }
    search.addEventListener("input", showResults);
    search.addEventListener("focus", function () { if (search.value.trim() && !placeAt(parseFloat(latIn.value), parseFloat(lonIn.value))) showResults(); });
    search.addEventListener("blur", function () {
      hideResults();
      // A full name typed or pasted without picking from the list still counts.
      const p = E.IndiaPlaces.find(search.value);
      if (p && !(near(p.latitude, parseFloat(latIn.value)) && near(p.longitude, parseFloat(lonIn.value)))) choose(p);
    });
    search.addEventListener("keydown", function (ev) {
      const open = !results.hidden;
      if (ev.key === "ArrowDown") { ev.preventDefault(); if (!open) showResults(); else setActive(activeIdx + 1); }
      else if (ev.key === "ArrowUp") { ev.preventDefault(); if (open) setActive(activeIdx - 1); }
      else if (ev.key === "Enter") {
        if (open && listed[activeIdx]) { ev.preventDefault(); choose(listed[activeIdx]); }
        else { ev.preventDefault(); apply(); }
      } else if (ev.key === "Escape" && open) { ev.stopPropagation(); hideResults(); }
    });

    // My location: the device's position; altitude from the device if it gives one,
    // else the nearest listed place's.
    function nearestElevation(lat, lon) {
      let best = null, bd = Infinity;
      E.IndiaPlaces.PLACES.forEach(function (p) {
        const d = (p.latitude - lat) * (p.latitude - lat) + (p.longitude - lon) * (p.longitude - lon);
        if (d < bd) { bd = d; best = p; }
      });
      return best ? best.elevation : 0;
    }
    if (!navigator.geolocation) geoBtn.hidden = true;
    geoBtn.addEventListener("click", function () {
      if (!navigator.geolocation) return;
      setNote("Finding your location…");
      geoBtn.disabled = true;
      navigator.geolocation.getCurrentPosition(function (pos) {
        geoBtn.disabled = false;
        const lat = Math.round(pos.coords.latitude * 1e4) / 1e4, lon = Math.round(pos.coords.longitude * 1e4) / 1e4;
        const alt = pos.coords.altitude;
        latIn.value = lat;
        lonIn.value = lon;
        elevIn.value = alt != null && isFinite(alt) && alt >= 0 ? Math.round(alt) : nearestElevation(lat, lon);
        chosenName = "My location";
        search.value = "";
        hideResults();
        setNote("");
        refresh();
      }, function () {
        geoBtn.disabled = false;
        setNote("Couldn't get this device's location. Search for a place instead.");
      }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 });
    });

    // The form's location as { name, latitude, longitude, elevation }, or null (focusing the bad field).
    function formLocation() {
      const lat = parseFloat(latIn.value), lon = parseFloat(lonIn.value), elev = parseFloat(elevIn.value);
      if (!isFinite(lat) || lat < -90 || lat > 90) { latIn.focus(); return null; }
      if (!isFinite(lon) || lon < -180 || lon > 180) { lonIn.focus(); return null; }
      if (!isFinite(elev) || elev < 0) { elevIn.focus(); return null; }
      const p = placeAt(lat, lon);
      const name = p ? (p.kind === "district" ? p.name + " (district)" : p.name) : chosenName || fmtCoords(lat, lon);
      return { name: name, latitude: lat, longitude: lon, elevation: elev };
    }

    // Selected line, Set as default / Reset only when the form differs from the default.
    function refresh() {
      const lat = parseFloat(latIn.value), lon = parseFloat(lonIn.value), elev = parseFloat(elevIn.value);
      const d = E.Settings.defaultLocation();
      resetBtn.textContent = locked ? "Reset to default" : "Reset to " + d.name;
      resetBtn.title = fmtCoords(d.latitude, d.longitude) + ", " + d.elevation + " m";
      const valid = isFinite(lat) && Math.abs(lat) <= 90 && isFinite(lon) && Math.abs(lon) <= 180;
      if (!valid) {
        curName.textContent = "Not chosen yet";
        curSub.textContent = "";
        defaultBtn.disabled = true;
        resetBtn.disabled = locked;
        return;
      }
      const info = describe(lat, lon);
      curName.textContent = !placeAt(lat, lon) && chosenName ? chosenName : info.name;
      curSub.textContent = info.sub + (isFinite(elev) ? " · " + elev + " m" : "");
      const same = near(lat, d.latitude) && near(lon, d.longitude) && isFinite(elev) && Math.abs(elev - d.elevation) < 0.5;
      defaultBtn.disabled = locked || same || !isFinite(elev) || elev < 0;
      resetBtn.disabled = locked || same;
    }
    [latIn, lonIn, elevIn].forEach(function (inp) { inp.addEventListener("input", function () { chosenName = null; refresh(); }); });

    defaultBtn.addEventListener("click", function () {
      const loc = formLocation();
      if (!loc) return;
      if (E.Settings.setDefaultLocation(loc)) {
        setNote("Default is now " + loc.name + ". Reset returns here.");
        refresh();
      } else {
        setNote("Couldn't save - browser storage unavailable.");
      }
    });
    resetBtn.addEventListener("click", function () {
      const d = E.Settings.defaultLocation();
      search.value = "";
      hideResults();
      latIn.value = d.latitude;
      lonIn.value = d.longitude;
      elevIn.value = d.elevation;
      chosenName = null;
      setNote("");
      refresh();
    });

    function apply() {
      const loc = formLocation();
      if (!loc) return false;
      api.setLocation(loc);
      pushRecent(loc);
      if (locked) {
        // The first place entered becomes the default, and the rest of the app unlocks.
        E.Settings.setDefaultLocation(loc);
        locked = false;
        closeBtn.disabled = cancelBtn.disabled = false;
      }
      closeDialog();
      update();
      return true;
    }
    applyBtn.addEventListener("click", apply);

    function openDialog() {
      lastFocus = document.activeElement;
      const loc = api.getSettings().location;
      if (locked) {
        latIn.value = lonIn.value = elevIn.value = "";
        setNote("Choose where you are. Your first location becomes the default.");
      } else {
        latIn.value = loc.latitude;
        lonIn.value = loc.longitude;
        elevIn.value = loc.elevation;
        setNote("");
      }
      chosenName = null;
      search.value = "";
      hideResults();
      closeBtn.disabled = cancelBtn.disabled = locked;
      refresh();
      dlg.classList.remove("hidden");
      stage.setAttribute("inert", "");
      search.focus();
    }
    function closeDialog() {
      dlg.classList.add("hidden");
      if (!locked) stage.removeAttribute("inert");
      if (lastFocus && lastFocus.focus && document.contains(lastFocus)) lastFocus.focus();
    }
    function cancel() { if (!locked) closeDialog(); }
    closeBtn.addEventListener("click", cancel);
    cancelBtn.addEventListener("click", cancel);
    dlg.addEventListener("pointerdown", function (e) { if (e.target === dlg) cancel(); });
    dlg.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { e.stopPropagation(); cancel(); return; }
      if (e.key === "Enter" && e.target.tagName === "INPUT" && e.target !== search) { e.preventDefault(); apply(); return; }
      if (e.key === "Tab") {
        const f = Array.from(card.querySelectorAll("button, input")).filter(function (n) { return !n.disabled && !n.hidden && n.offsetParent !== null && !n.readOnly; });
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });

    // ---- start
    setShown(shown, false);
    if (locked) openDialog();
    return { update: update, open: openDialog };
  }

  E.LocationUI = { init: init, describe: describe };
})(typeof window !== "undefined" ? window : globalThis);
