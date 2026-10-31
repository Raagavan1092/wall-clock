// Wiring: load data, run the tick loop, handle ring-cycling input, the
// settings panel, and the debug time override. This is the only file that
// touches both the engine (via VedicEngine.Panchanga) and the DOM/renderer
// (via VedicEngine.Dial / RingAdapter) - dial.js and ring-adapter.js stay
// agnostic of each other.
(function () {
  "use strict";

  const E = window.VedicEngine;

  const params = new URLSearchParams(window.location.search);

  // Time override: an offset applied to the real clock, so the dial keeps
  // ticking forward from whatever instant it's set to rather than freezing.
  // User-facing (via the Time section in the settings panel), with ?t= as a
  // quick way to load a specific starting instant from a URL.
  let timeOffsetMs = 0;
  const tParam = params.get("t");
  if (tParam) {
    const parsed = new Date(tParam);
    if (!isNaN(parsed.getTime())) {
      timeOffsetMs = parsed.getTime() - Date.now();
    }
  }

  // Pause: freezes the clock at whatever instant it's at, for inspecting the
  // dial without it changing underneath you. Resuming picks up exactly where
  // it was paused and continues ticking forward from there (not from "now").
  let pausedAt = null;

  function getNow() {
    return pausedAt || new Date(Date.now() + timeOffsetMs);
  }

  // User-facing settings (location/ayanamsa/sunrise-definition/ring-order),
  // persisted to localStorage via settings.js. `activeRingOrder` is kept as
  // its own variable (rather than re-reading settings.ringOrder everywhere)
  // so cycling/rendering code doesn't care whether it came from a saved
  // setting or the engine's own default order.
  let settings = E.Settings.load();
  // The Switch display cycle: the saved order minus any ring hidden in
  // Settings. Can be empty, in which case the outer ring is left blank.
  function visibleRingOrder() {
    return settings.ringOrder.filter(function (k) { return settings.hiddenRings.indexOf(k) === -1; });
  }
  let activeRingOrder = visibleRingOrder();
  let currentRingIndex = 0;

  // Cache: a full Panchanga.compute() involves several astronomical searches
  // and is only re-run when "now" falls outside the cached Vedic day, settings
  // changed, or one of the astronomical fields (tithi/nakshatra/yoga/karana)
  // has expired - those don't only change at sunrise, they change mid-day on
  // their own schedule, so the day-boundary check alone isn't enough (this bit
  // us: with tithi/nakshatra promoted to always-visible rings, a stale cache
  // here would mean a ring silently showing the wrong value for hours).
  let cachedSnapshot = null;

  function isExpired(now, snapshot) {
    return (
      now < snapshot.anchors.governingSunrise ||
      now >= snapshot.anchors.nextSunrise ||
      now >= snapshot.tithi.endTime ||
      now >= snapshot.nakshatra.endTime ||
      now >= snapshot.yoga.endTime ||
      now >= snapshot.karana.endTime
    );
  }

  function getSnapshot(now) {
    if (!cachedSnapshot || isExpired(now, cachedSnapshot)) {
      cachedSnapshot = E.Panchanga.compute(now, settings);
      return { snapshot: cachedSnapshot, changed: true };
    }
    return { snapshot: cachedSnapshot, changed: false };
  }

  // Forces the next render() to recompute everything from scratch - needed
  // whenever a setting that feeds Panchanga.compute() changes.
  function invalidateCache() {
    cachedSnapshot = null;
    lastRenderedRingKey = null;
  }

  // "Switch time": "ghati" (Vedic readout leads, 60-ghati scale, pala hand)
  // or "hour" (clock readout leads, 24-hour scale, minute hand). Remembered
  // across reloads; it's a viewing preference, not a Settings-panel setting.
  const TIME_MODE_KEY = "vedicWallClock.timeMode";
  let timeMode = "ghati";
  try { if (localStorage.getItem(TIME_MODE_KEY) === "hour") timeMode = "hour"; } catch (e) { /* storage unavailable */ }
  let lastRenderedTimeMode = null;

  let data = null;
  let dialHandles = null;
  let lastRenderedRingKey = null;
  let lastOuterRingDescriptor = null;

  const VARA_FALLBACK = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  function fmtTime(date) {
    return date.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: false, hour: "2-digit", minute: "2-digit" });
  }

  function buildCentreLines(now, snapshot, ringDescriptor, ghatiNow) {
    const varaName = (data.vara.names && data.vara.names[snapshot.varaIndex]) || VARA_FALLBACK[snapshot.varaIndex];
    // `ghatiNow`, not `snapshot.ghati`: the snapshot is cached for hours at a
    // time (see getSnapshot/isExpired above), so snapshot.ghati is whatever
    // it was AT CACHE TIME - reading it here left this readout frozen between
    // cache refreshes. `ghatiNow` is recomputed fresh every render() call,
    // same as the hand angle.
    const g = ghatiNow;

    // Date is the Vedic day's own date (governingSunrise's calendar date in
    // IST), same as vara - before today's sunrise this still reads as
    // yesterday's date, consistently with the weekday shown.
    const dateText = snapshot.anchors.governingSunrise.toLocaleDateString("en-IN", {
      timeZone: "Asia/Kolkata", day: "numeric", month: "long", year: "numeric",
    });

    // Ghati/pala leads by default (this is a Vedic clock first), with the
    // modern clock as the smaller line underneath; "Switch time" swaps them.
    const clockText = now.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: false });
    const timeLines = timeMode === "hour"
      ? [
          { text: clockText, emphasis: "ghati" },
          { text: "Ghaṭī " + g.ghati + " · Pala " + g.pala + " · Vipala " + g.vipala, emphasis: "clock-secondary" },
        ]
      : [
          { text: "Ghaṭī " + g.ghati + " · Pala " + g.pala, subText: " · Vipala " + g.vipala, emphasis: "ghati" },
          { text: clockText, emphasis: "clock-secondary" },
        ];
    const lines = timeLines.concat([
      { text: dateText },
      { text: varaName },
    ]);

    // Now/next for the active switchable ring. Every segment in most rings
    // (Muhurta/Yaama/Kala/Hora) is named, but Good/Bad Yogas has long blank
    // stretches with no active yoga (seg.text === "") - skip the "now" line
    // rather than show a bare "Good / Bad Yogas: ", and look past any
    // immediately-following blank segment(s) for "Next" rather than just
    // the next array entry.
    if (!ringDescriptor) return lines; // every switchable ring hidden
    const nowSeg = ringDescriptor.segments.find(function (seg) {
      return now >= seg.startTime && now < seg.endTime;
    });
    if (nowSeg && nowSeg.text) {
      lines.push({ text: ringDescriptor.title + ": " + nowSeg.text });
    }
    const nextSeg = ringDescriptor.segments.find(function (seg) {
      return seg.startTime > now && seg.text;
    });
    if (nextSeg) {
      lines.push({ text: "Next: " + nextSeg.text + " @ " + fmtTime(nextSeg.startTime) });
    }

    // Tithi/nakshatra are no longer duplicated here - they have their own
    // always-visible rings now (dial.js nakshatraRingGroup/tithiRingGroup).
    return lines;
  }

  function render() {
    const now = getNow();
    const { snapshot, changed } = getSnapshot(now);
    const ringKey = activeRingOrder[currentRingIndex];

    if (changed) {
      // Tithi/nakshatra/day-night/yoga-alerts only depend on the snapshot,
      // never on which switchable ring is toggled, so they're all rebuilt
      // whenever the snapshot itself changes. The yoga-alert ring draws
      // itself only when at least one of its five yogas is active that day
      // (see renderYogaAlertRing) - this call always runs, the appearing/
      // disappearing happens inside dial.js.
      E.Dial.renderNakshatraRing(dialHandles.nakshatraRingGroup, E.RingAdapter.build("nakshatra", snapshot, data));
      E.Dial.renderTithiRing(dialHandles.tithiRingGroup, E.RingAdapter.build("tithi", snapshot, data));
      E.Dial.renderDayNightRing(dialHandles.dayNightRingGroup, E.RingAdapter.buildDayNight(snapshot));
      E.Dial.renderYogaAlertRing(dialHandles.yogaRingGroup, E.RingAdapter.buildYogaAlerts(snapshot, data));
      E.Dial.renderDayMarkers(dialHandles.markerGroup, E.RingAdapter.buildDayMarkers(snapshot, data, settings.hiddenMarkers));
      applyFixedRingVisibility();
    }
    if (changed || ringKey !== lastRenderedRingKey) {
      if (ringKey) {
        lastOuterRingDescriptor = E.RingAdapter.build(ringKey, snapshot, data);
        E.Dial.renderOuterRing(dialHandles.outerRingGroup, lastOuterRingDescriptor);
      } else {
        lastOuterRingDescriptor = null;
        E.Dial.clearGroup(dialHandles.outerRingGroup);
      }
      lastRenderedRingKey = ringKey;
    }

    // The scale under the hands: 60 ghatis, or (hour mode) 24 IST clock
    // hours placed on the same sunrise-anchored angles, so no ring moves.
    // The hour scale depends on the day's sunrise, so it's redrawn with the
    // snapshot too.
    if (timeMode !== lastRenderedTimeMode || (changed && timeMode === "hour")) {
      if (timeMode === "hour") E.Dial.renderHourScale(dialHandles.scaleGroup, E.RingAdapter.buildHourScale(snapshot));
      else E.Dial.renderGhatiScale(dialHandles.scaleGroup);
      lastRenderedTimeMode = timeMode;
    }

    const ghatiNow = E.Ghati.current(now, snapshot.anchors);
    // The day hand is the same in both modes (one turn per sunrise-to-
    // sunrise day). The second hand is the pala hand (one turn per ghati,
    // 24 min) or, in hour mode, a minute hand (one turn per IST hour).
    E.Dial.setHand(dialHandles.handGroup, ghatiNow.angleDeg);
    E.Dial.setPalaHand(dialHandles.palaHandGroup, timeMode === "hour" ? minuteAngle(now) : ghatiNow.palaAngleDeg);
    E.Dial.setCentreText(dialHandles.centreGroup, buildCentreLines(now, snapshot, lastOuterRingDescriptor, ghatiNow));
  }

  const IST_OFFSET_MS = 5.5 * 3600 * 1000;
  function minuteAngle(now) {
    const msIntoHour = (now.getTime() + IST_OFFSET_MS) % 3600000;
    return (msIntoHour / 3600000) * 360;
  }

  function toggleTimeMode() {
    timeMode = timeMode === "hour" ? "ghati" : "hour";
    try { localStorage.setItem(TIME_MODE_KEY, timeMode); } catch (e) { /* storage unavailable */ }
    render();
  }

  // Always-on rings hidden in Settings are simply not displayed; the band
  // they'd occupy stays as plain background, so nothing else moves.
  function applyFixedRingVisibility() {
    const groups = {
      tithi: dialHandles.tithiRingGroup, nakshatra: dialHandles.nakshatraRingGroup,
      yogaAlerts: dialHandles.yogaRingGroup, dayNight: dialHandles.dayNightRingGroup,
    };
    Object.keys(groups).forEach(function (k) {
      groups[k].style.display = settings.hiddenRings.indexOf(k) === -1 ? "" : "none";
    });
  }

  function cycleRing(delta) {
    if (!activeRingOrder.length) return;
    currentRingIndex = (currentRingIndex + delta + activeRingOrder.length) % activeRingOrder.length;
    render();
  }

  function wireInput(svg) {
    // Tapping the dial itself no longer cycles the ring (per the project
    // owner) - so a tap on a segment just shows its tooltip. The "Switch
    // display" button, swipes and arrow keys do it instead. The buttons sit
    // inside the SVG, so they stop their events here rather than letting
    // them reach the dial's own handlers.
    function wireButton(button, action) {
      button.addEventListener("click", function (e) { e.stopPropagation(); action(); });
      button.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); action(); }
      });
      button.addEventListener("touchend", function (e) { e.stopPropagation(); }, { passive: true });
    }
    wireButton(dialHandles.timeButton, toggleTimeMode);
    wireButton(dialHandles.displayButton, function () { cycleRing(1); });

    window.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight" || e.key === " ") cycleRing(1);
      else if (e.key === "ArrowLeft") cycleRing(-1);
    });

    let touchStartX = null;
    svg.addEventListener("touchstart", function (e) { touchStartX = e.changedTouches[0].clientX; }, { passive: true });
    svg.addEventListener("touchend", function (e) {
      if (touchStartX == null) return;
      const dx = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(dx) > 40) cycleRing(dx < 0 ? 1 : -1);
      touchStartX = null;
    }, { passive: true });
  }

  // Time control lives in the settings panel (see index.html's "Time"
  // section) but applies immediately on change, unlike the other settings
  // which wait for Save - scrubbing time is a live control, not a persisted
  // preference, so there's nothing to persist and no reason to make it wait.
  function wireTimeControl() {
    const input = document.getElementById("set-time");
    const nowBtn = document.getElementById("set-time-now");
    const pauseBtn = document.getElementById("set-time-pause");
    const liveIndicator = document.getElementById("set-time-live");

    function syncInput() {
      const now = getNow();
      const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
      input.value = local.toISOString().slice(0, 16);
      liveIndicator.textContent = pausedAt ? "Paused" : timeOffsetMs === 0 ? "Live (following real time)" : "Overridden - not following real time";
      pauseBtn.textContent = pausedAt ? "Resume" : "Pause";
    }
    syncInput();

    input.addEventListener("change", function () {
      const parsed = new Date(input.value);
      if (!isNaN(parsed.getTime())) {
        if (pausedAt) {
          pausedAt = parsed; // stay paused, but at the newly-set instant
        } else {
          timeOffsetMs = parsed.getTime() - Date.now();
        }
        syncInput();
        render();
      }
    });
    nowBtn.addEventListener("click", function () {
      timeOffsetMs = 0;
      pausedAt = null;
      syncInput();
      render();
    });
    pauseBtn.addEventListener("click", function () {
      if (pausedAt) {
        // Resume from exactly where it was paused, not from real "now".
        timeOffsetMs = pausedAt.getTime() - Date.now();
        pausedAt = null;
      } else {
        pausedAt = getNow();
      }
      syncInput();
      render();
    });

    // Keep the field in sync while it's not focused, so it visibly ticks
    // forward if left open (and so reopening settings later shows "now").
    setInterval(function () {
      if (document.activeElement !== input) syncInput();
    }, 1000);
  }

  const LAYER_TITLES = {
    switchable: "Switchable ring", yogaAlerts: "Yogas", nakshatra: "Nakṣatra", tithi: "Tithi",
  };

  function wireSettingsPanel() {
    const toggleBtn = document.getElementById("settings-toggle");
    const panel = document.getElementById("settings-panel");
    const latInput = document.getElementById("set-lat");
    const lonInput = document.getElementById("set-lon");
    const elevInput = document.getElementById("set-elev");
    const resetLocationBtn = document.getElementById("set-location-reset");
    const ayanamsaSelect = document.getElementById("set-ayanamsa");
    const ringOrderList = document.getElementById("set-ring-order");
    const saveBtn = document.getElementById("settings-save");
    const cancelBtn = document.getElementById("settings-cancel");
    const closeBtn = document.getElementById("settings-close");

    const fixedRingList = document.getElementById("set-fixed-rings");
    const layerOrderList = document.getElementById("set-layer-order");
    const markerList = document.getElementById("set-markers");

    // Working copies of the ring order and the hidden rings/markers, only
    // committed to `settings` on Save.
    let workingRingOrder = settings.ringOrder.slice();
    let workingHiddenRings = settings.hiddenRings.slice();
    let workingHiddenMarkers = settings.hiddenMarkers.slice();
    let workingLayerOrder = settings.layerOrder.slice();

    // An ↑/↓ reorderable list of `order` (mutated in place), labelled by
    // `titleFor(key)`; `extraFor(key)`, if given, adds content (e.g. a show
    // checkbox) before the title.
    function renderReorderList(container, order, titleFor, extraFor) {
      container.innerHTML = "";
      order.forEach(function (key, i) {
        const li = document.createElement("li");
        const label = document.createElement("label");
        if (extraFor) label.appendChild(extraFor(key));
        label.appendChild(document.createTextNode((extraFor ? " " : "") + titleFor(key)));
        li.appendChild(label);
        [["↑", -1], ["↓", 1]].forEach(function (pair) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.textContent = pair[0];
          const j = i + pair[1];
          btn.disabled = j < 0 || j >= order.length;
          btn.addEventListener("click", function () {
            [order[i], order[j]] = [order[j], order[i]];
            renderReorderList(container, order, titleFor, extraFor);
          });
          li.appendChild(btn);
        });
        container.appendChild(li);
      });
    }

    // A "show" checkbox bound to whether `key` is absent from `hiddenList`.
    function showCheckbox(key, hiddenList) {
      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = hiddenList.indexOf(key) === -1;
      box.addEventListener("change", function () {
        const at = hiddenList.indexOf(key);
        if (box.checked && at !== -1) hiddenList.splice(at, 1);
        if (!box.checked && at === -1) hiddenList.push(key);
      });
      return box;
    }

    function renderCheckboxList(container, titles, hiddenList) {
      container.innerHTML = "";
      Object.keys(titles).forEach(function (key) {
        const label = document.createElement("label");
        label.appendChild(showCheckbox(key, hiddenList));
        label.appendChild(document.createTextNode(" " + titles[key]));
        container.appendChild(label);
      });
    }

    function renderRingOrderList() {
      renderReorderList(ringOrderList, workingRingOrder, function (key) {
        return E.RingAdapter.RING_TITLES[key] || key;
      }, function (key) { return showCheckbox(key, workingHiddenRings); });
    }

    function populateForm() {
      latInput.value = settings.location.latitude;
      lonInput.value = settings.location.longitude;
      elevInput.value = settings.location.elevation;
      ayanamsaSelect.value = settings.ayanamsa;
      Array.from(document.getElementsByName("sunriseEdge")).forEach(function (radio) {
        radio.checked = radio.value === settings.sunriseEdge;
      });
      workingRingOrder = settings.ringOrder.slice();
      workingHiddenRings = settings.hiddenRings.slice();
      workingHiddenMarkers = settings.hiddenMarkers.slice();
      workingLayerOrder = settings.layerOrder.slice();
      renderRingOrderList();
      renderReorderList(layerOrderList, workingLayerOrder, function (key) { return LAYER_TITLES[key]; });
      renderCheckboxList(fixedRingList, E.RingAdapter.FIXED_RING_TITLES, workingHiddenRings);
      renderCheckboxList(markerList, E.RingAdapter.MARKER_TITLES, workingHiddenMarkers);
    }

    function open() {
      populateForm();
      panel.classList.remove("hidden");
    }
    function close() {
      panel.classList.add("hidden");
    }

    toggleBtn.addEventListener("click", function () {
      if (panel.classList.contains("hidden")) open(); else close();
    });
    cancelBtn.addEventListener("click", close);

    resetLocationBtn.addEventListener("click", function () {
      const d = E.Settings.defaults().location;
      latInput.value = d.latitude;
      lonInput.value = d.longitude;
      elevInput.value = d.elevation;
    });

    // Returns true on success (and closes), false if validation failed (stays open).
    function saveAndClose() {
      const lat = parseFloat(latInput.value);
      const lon = parseFloat(lonInput.value);
      const elev = parseFloat(elevInput.value);
      if (!isFinite(lat) || lat < -90 || lat > 90) { latInput.focus(); return false; }
      if (!isFinite(lon) || lon < -180 || lon > 180) { lonInput.focus(); return false; }
      if (!isFinite(elev) || elev < 0) { elevInput.focus(); return false; }

      const sunriseEdge = (document.querySelector('input[name="sunriseEdge"]:checked') || {}).value || "upper-limb";

      settings = {
        location: Object.assign({}, settings.location, { latitude: lat, longitude: lon, elevation: elev }),
        ayanamsa: ayanamsaSelect.value,
        sunriseEdge: sunriseEdge,
        ringOrder: workingRingOrder.slice(),
        hiddenRings: workingHiddenRings.slice(),
        hiddenMarkers: workingHiddenMarkers.slice(),
        layerOrder: workingLayerOrder.slice(),
      };
      E.Settings.save(settings);
      E.Dial.setLayerOrder(settings.layerOrder);
      activeRingOrder = visibleRingOrder();
      currentRingIndex = 0;
      invalidateCache();
      render();
      close();
      return true;
    }

    saveBtn.addEventListener("click", saveAndClose);
    // The × at the top behaves like Save, not Cancel: per the project owner,
    // closing via the corner button should keep whatever's in the form, the
    // same as clicking Save - only the bottom Cancel button discards.
    closeBtn.addEventListener("click", saveAndClose);
  }

  async function main() {
    data = await fetch("js/data/panchanga-data.json", { cache: "no-store" }).then(function (r) { return r.json(); });

    const svg = document.getElementById("dial");
    dialHandles = E.Dial.buildStaticStructure(svg);
    E.Dial.setLayerOrder(settings.layerOrder);

    wireInput(svg);
    wireTimeControl();
    wireSettingsPanel();

    render();
    // 100ms (not 1000ms): the ghati/pala/vipala readout should tick visibly
    // and smoothly, the way a seconds hand does, rather than jumping in
    // whole-second steps - vipala alone is worth 0.4s, so a 1s render rate
    // made it skip values instead of stepping through them.
    setInterval(render, 100);
  }

  main().catch(function (err) {
    console.error(err);
    document.body.textContent = "Fatal error: " + err.message;
  });
})();
