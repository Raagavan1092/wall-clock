// The location drop-down (the place name with a drop-down arrow in the top row: recent places and
// Change location…) and its Change location dialog. Owns everything about
// choosing a place: search, My location, recent places, Set as default and
// Reset. app.js hands in the few things it needs (settings, setLocation).
// (Changing the day and time is edit mode's job, in app.js.)
(function (global) {
  "use strict";

  const E = global.VedicEngine = global.VedicEngine || {};
  const RECENT_KEY = "vedicWallClock.recentLocations.v1";
  const MAX_RECENT = 4;
  const SVGNS = "http://www.w3.org/2000/svg";

  const $ = function (id) { return document.getElementById(id); };
  const near = function (a, b) { return Math.abs(a - b) < 1e-4; };
  const fmtCoords = function (lat, lon) { return lat + "°N, " + lon + "°E"; };
  function dms(lat, lon) {
    return Math.abs(lat).toFixed(2) + "° " + (lat < 0 ? "S" : "N") + " · " + Math.abs(lon).toFixed(2) + "° " + (lon < 0 ? "W" : "E");
  }

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

  // Whether (lat, lon) is the saved default place, and the "(Default)" tag shown after its name.
  function isDefault(lat, lon) {
    if (E.Settings.needsLocation()) return false;
    const d = E.Settings.defaultLocation();
    return near(d.latitude, lat) && near(d.longitude, lon);
  }
  function defaultTag() {
    const t = document.createElement("span");
    t.className = "loc-default-tag";
    t.textContent = " (Default)";
    return t;
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

  function el(name, attrs, text) {
    const n = document.createElementNS(SVGNS, name);
    Object.keys(attrs || {}).forEach(function (a) { n.setAttribute(a, attrs[a]); });
    if (text != null) n.textContent = text;
    return n;
  }

  function init(api) {
    const toggle = $("loc-toggle"), stage = $("stage");
    const menu = $("loc-menu"), recentBox = $("loc-recent"), changeBtn = $("loc-change");

    const dlg = $("loc-dialog"), card = dlg.querySelector(".ld-card");
    const closeBtn = $("loc-close"), cancelBtn = $("loc-cancel"), applyBtn = $("loc-apply");
    const defaultBtn = $("loc-default"), resetBtn = $("loc-reset"), geoBtn = $("loc-geo");
    const search = $("loc-search"), results = $("loc-results"), note = $("loc-note");
    const latIn = $("loc-lat"), lonIn = $("loc-lon"), elevIn = $("loc-elev");
    const curName = $("loc-current-name"), curSub = $("loc-current-sub");

    // First visit: nothing saved yet, so the dialog opens at once and cannot be
    // dismissed until a place is applied (that first place becomes the default).
    let locked = E.Settings.needsLocation();

    // ================= place menu =================
    // A drop-down under that button: a tap anywhere else (or Esc) closes it,
    // and opening the alarm list closes it.
    function menuOpen() { return !menu.hidden; }
    function setMenu(on) {
      if (on) renderRecent();
      menu.hidden = !on;
      toggle.setAttribute("aria-expanded", String(on));
      toggle.classList.toggle("on", on);
      if (on) document.dispatchEvent(new CustomEvent("dropdown-open", { detail: "loc" }));
    }
    toggle.addEventListener("click", function () { setMenu(!menuOpen()); });
    document.addEventListener("pointerdown", function (e) {
      if (menuOpen() && !menu.contains(e.target) && !toggle.contains(e.target)) setMenu(false);
    });
    document.addEventListener("dropdown-open", function (e) { if (e.detail !== "loc" && menuOpen()) setMenu(false); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && menuOpen() && dlg.classList.contains("hidden")) { setMenu(false); toggle.focus(); }
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
        if (isDefault(r.latitude, r.longitude)) n.appendChild(defaultTag());
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
          setMenu(false);
          if (!selected) api.setLocation(r);
          pushRecent(r);
          update();
        });
        recentBox.appendChild(b);
      });
    }
    changeBtn.addEventListener("click", function () { setMenu(false); openDialog(); });

    // The button shows the name of the place on show.
    const toggleName = $("loc-toggle-name");
    let lastTitle = "";
    function update() {
      const loc = api.getSettings().location;
      const name = describe(loc.latitude, loc.longitude).short;
      const title = "Location: " + name + " (" + dms(loc.latitude, loc.longitude) + ")";
      if (title !== lastTitle) { lastTitle = title; toggleName.textContent = name; toggle.title = title; toggle.setAttribute("aria-label", title); }
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
      if (!locked && isDefault(lat, lon)) curName.appendChild(defaultTag());
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
    update();
    if (locked) openDialog();
    return { update: update, open: openDialog };
  }

  E.LocationUI = { init: init, describe: describe };
})(typeof window !== "undefined" ? window : globalThis);
