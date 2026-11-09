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
  // their own schedule, so the day-boundary check alone isn't enough (a stale
  // cache here would mean a ring silently showing the wrong value for hours).
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
    lastShowKey = null;
    lastSecondaryView = null;
  }

  // "Switch time": "ghati" (Vedic readout leads, 60-ghati scale, pala hand)
  // or "hour" (clock readout leads, 24-hour scale, minute hand). Remembered
  // across reloads; it's a viewing preference, not a Settings-panel setting.
  const TIME_MODE_KEY = "vedicWallClock.timeMode";
  let timeMode = "ghati";
  try { if (localStorage.getItem(TIME_MODE_KEY) === "hour") timeMode = "hour"; } catch (e) { /* storage unavailable */ }
  let lastRenderedTimeMode = null;

  // "Show good times" / "Show bad times": which halves of the Good / Bad
  // Times ring are drawn. A viewing preference, remembered across reloads.
  const SHOW_GOOD_KEY = "vedicWallClock.showGood", SHOW_BAD_KEY = "vedicWallClock.showBad";
  const show = { good: true, bad: true };
  try {
    if (localStorage.getItem(SHOW_GOOD_KEY) === "0") show.good = false;
    if (localStorage.getItem(SHOW_BAD_KEY) === "0") show.bad = false;
  } catch (e) { /* storage unavailable */ }
  let lastShowKey = null;

  // "Secondary yogas": the dial shows the tithi-vāra-nakṣatra yogas on the
  // Good / Bad Times ring, with no switchable ring. A viewing preference.
  const SECONDARY_KEY = "vedicWallClock.secondaryYogas";
  let secondaryView = false;
  try { secondaryView = localStorage.getItem(SECONDARY_KEY) === "1"; } catch (e) { /* storage unavailable */ }
  let lastSecondaryView = null;

  function yogaOpts() {
    return { yogaSets: settings.yogaSets, regionalLimits: settings.regionalLimits !== false };
  }

  let data = null;
  let dialHandles = null;
  let lastRenderedRingKey = null;
  let lastOuterRingDescriptor = null;
  let lastGoodBad = null;

  const VARA_FALLBACK = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  function fmtTime(date) {
    return date.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: false, hour: "2-digit", minute: "2-digit" });
  }

  // A time for the centre readout, with " (Nov 3)" after it when it falls
  // after midnight on the next date (see RingAdapter.dateNote).
  function fmtTimeD(date, snapshot) {
    return fmtTime(date) + E.RingAdapter.dateNote(date, snapshot.anchors);
  }

  function buildCentreLines(now, snapshot, ringDescriptor, ghatiNow) {
    const varaName = (data.vara.names && data.vara.names[snapshot.varaIndex]) || VARA_FALLBACK[snapshot.varaIndex];
    // `ghatiNow`, not `snapshot.ghati`: the snapshot is cached for hours at a
    // time (see getSnapshot/isExpired above), so snapshot.ghati is whatever
    // it was AT CACHE TIME - reading it here left this readout frozen between
    // cache refreshes. `ghatiNow` is recomputed fresh every render() call,
    // same as the hand angle.
    const g = ghatiNow;

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
    // Vāra and the tithi holding right now share a line ("Ravivāra ·
    // Saptamī (kṛṣṇa)"), since together they name the day.
    const lines = timeLines.concat([
      { text: varaName + " · " + E.RingAdapter.tithiNameAt(snapshot, data, now) },
    ]);

    // A blank line, then the Good / Bad Times ring's status: bad first (the one people check),
    // then good. Each says what is active and until when, or what is next.
    if (lastGoodBad && settings.hiddenRings.indexOf("goodBad") === -1 && (show.bad || show.good)) {
      lines.push({ text: "", emphasis: "gap" });
      [["bad", lastGoodBad.bad, "⚠\uFE0E "], ["good", lastGoodBad.good, "✓ "]].filter(function (row) { return show[row[0]]; }).forEach(function (row) {
        const st = E.RingAdapter.statusFor(row[1], now);
        if (!st) {
          lines.push({ text: "No more " + row[0] + " times today", emphasis: "muted" });
        } else if (st.active) {
          lines.push({ text: row[2] + st.text + " · till " + fmtTimeD(st.until, snapshot), emphasis: row[0] });
        } else {
          lines.push({ text: "Next " + row[0] + ": " + st.text + " @ " + fmtTimeD(st.at, snapshot), emphasis: "muted" });
        }
      });
    }

    if (secondaryView) {
      lines.push({ text: "", emphasis: "gap" });
      lines.push({ text: "Secondary yogas", emphasis: "ring" });
      return lines;
    }

    // Now/next for the active switchable ring, on two lines. Kāla has a
    // blank (unlabelled) night band - name just the ring there rather than
    // show a bare "Kāla: ", and look past blank segment(s) for "next".
    if (!ringDescriptor) return lines; // every switchable ring hidden
    const nextSeg = ringDescriptor.segments.find(function (seg) {
      return seg.startTime > now && seg.text;
    });
    // The current division is already highlighted on the dial, so the centre
    // names the ring (highlighted) and says only when the next one starts.
    lines.push({ text: "", emphasis: "gap" });
    lines.push({ text: "Current Ring: " + ringDescriptor.title, emphasis: "ring" });
    if (nextSeg) lines.push({ text: "next " + nextSeg.text + " " + fmtTimeD(nextSeg.startTime, snapshot) });
    return lines;
  }

  function render() {
    const now = getNow();
    const { snapshot, changed } = getSnapshot(now);
    const ringKey = activeRingOrder[currentRingIndex];

    const viewChanged = secondaryView !== lastSecondaryView;
    if (viewChanged) {
      E.Dial.setSecondaryMode(secondaryView);
      document.body.classList.toggle("secondary-view", secondaryView);
      lastSecondaryView = secondaryView;
    }
    if (changed || viewChanged) {
      // Good/bad times and day/night only depend on the snapshot (and the
      // view), never on which switchable ring is toggled, so they're rebuilt
      // whenever the snapshot itself changes.
      lastGoodBad = secondaryView
        ? E.RingAdapter.buildSecondaryYogas(snapshot, data, yogaOpts())
        : E.RingAdapter.buildGoodBadTimes(snapshot, data, yogaOpts());
      E.Dial.renderDayNightRing(dialHandles.dayNightRingGroup, E.RingAdapter.buildDayNight(snapshot));
      E.Dial.renderDayMarkers(dialHandles.markerGroup, E.RingAdapter.buildDayMarkers(snapshot, data, settings.hiddenMarkers));
      applyFixedRingVisibility();
    }
    // The Good / Bad Times ring also depends on which halves are switched on.
    const showKey = (show.good ? "g" : "-") + (show.bad ? "b" : "-");
    if (changed || viewChanged || showKey !== lastShowKey) {
      E.Dial.renderGoodBadRing(dialHandles.goodBadRingGroup, lastGoodBad.good, lastGoodBad.bad, show);
      lastShowKey = showKey;
    }
    if (changed || viewChanged || ringKey !== lastRenderedRingKey) {
      if (ringKey && !secondaryView) {
        lastOuterRingDescriptor = E.RingAdapter.build(ringKey, snapshot, data);
        E.Dial.renderOuterRing(dialHandles.outerRingGroup, lastOuterRingDescriptor, E.RingAdapter.START_LABEL_RINGS);
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

    // Highlight what's active now, dim what's over - every tick, since it
    // changes with the time, not just with the snapshot.
    E.Dial.updateTimeState([dialHandles.outerRingGroup, dialHandles.goodBadRingGroup], now);

    const ghatiNow = E.Ghati.current(now, snapshot.anchors);
    // The day hand is the same in both modes (one turn per sunrise-to-
    // sunrise day). The second hand is the pala hand (one turn per ghati,
    // 24 min) or, in hour mode, a minute hand (one turn per IST hour).
    E.Dial.setHand(dialHandles.handGroup, ghatiNow.angleDeg);
    E.Dial.setPalaHand(dialHandles.palaHandGroup, timeMode === "hour" ? minuteAngle(now) : ghatiNow.palaAngleDeg);
    E.Dial.setCentreText(dialHandles.centreGroup, buildCentreLines(now, snapshot, lastOuterRingDescriptor, ghatiNow), dialHandles.switchGroup);
    updateSwitchLabel();
    if (changed || !controlsSynced) { controlsSynced = true; syncDayControls(); }
  }
  let controlsSynced = false;

  // "Next ring (<ring>)" / "Previous ring (<ring>)" on the corner buttons by the dial.
  let lastSwitchLabel = null;
  function updateSwitchLabel() {
    const n = activeRingOrder.length;
    function title(delta) {
      const k = n ? activeRingOrder[(currentRingIndex + delta + n) % n] : null;
      return k ? (E.RingAdapter.RING_TITLES[k] || k) : "";
    }
    const next = title(1), prev = title(-1);
    const key = prev + "|" + next;
    if (key === lastSwitchLabel) return;
    lastSwitchLabel = key;
    const nb = document.getElementById("btn-next-display"), pb = document.getElementById("btn-prev-display");
    nb.querySelector(".rc-name").textContent = next;
    pb.querySelector(".rc-name").textContent = prev;
    nb.title = nb.ariaLabel = next ? "Next ring (" + next + ")" : "Next ring";
    pb.title = pb.ariaLabel = prev ? "Previous ring (" + prev + ")" : "Previous ring";
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
      goodBad: dialHandles.goodBadRingGroup, dayNight: dialHandles.dayNightRingGroup,
    };
    Object.keys(groups).forEach(function (k) {
      groups[k].style.display = settings.hiddenRings.indexOf(k) === -1 ? "" : "none";
    });
    // With the Good / Bad Times ring hidden in Settings its toggles have nothing to do.
    const goodBadOn = settings.hiddenRings.indexOf("goodBad") === -1;
    document.getElementById("btn-show-good").hidden = !goodBadOn;
    document.getElementById("btn-show-bad").hidden = !goodBadOn;
  }

  function cycleRing(delta) {
    if (!activeRingOrder.length || secondaryView) return;
    currentRingIndex = (currentRingIndex + delta + activeRingOrder.length) % activeRingOrder.length;
    render();
  }

  function wireInput(svg) {
    // Tapping the dial itself no longer cycles the ring (per the project
    // owner) - so a tap on a segment just shows its tooltip. The buttons
    // below / beside the clock and arrow keys do it instead (no swiping).
    function setShown(kind, on) {
      show[kind] = on;
      try { localStorage.setItem(kind === "good" ? SHOW_GOOD_KEY : SHOW_BAD_KEY, on ? "1" : "0"); } catch (e) { /* storage unavailable */ }
      syncShowButtons();
      render();
    }
    function syncShowButtons() {
      document.getElementById("btn-show-good").setAttribute("aria-checked", String(show.good));
      document.getElementById("btn-show-bad").setAttribute("aria-checked", String(show.bad));
    }
    const switchBtn = document.getElementById("btn-switch-time");
    switchBtn.addEventListener("click", toggleTimeMode);
    switchBtn.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleTimeMode(); }
    });
    document.getElementById("btn-next-display").addEventListener("click", function () { cycleRing(1); });
    document.getElementById("btn-prev-display").addEventListener("click", function () { cycleRing(-1); });
    document.getElementById("btn-show-good").addEventListener("click", function () { setShown("good", !show.good); });
    document.getElementById("btn-show-bad").addEventListener("click", function () { setShown("bad", !show.bad); });
    syncShowButtons();

    const secBtn = document.getElementById("btn-secondary-yogas");
    function syncSecondaryButton() {
      secBtn.setAttribute("aria-pressed", String(secondaryView));
      secBtn.textContent = secondaryView ? "Main view" : "Secondary yogas";
      secBtn.title = secondaryView ? "Back to the daily windows and the switchable rings" : "Show the tithi-vāra-nakṣatra yogas";
    }
    secBtn.addEventListener("click", function () {
      secondaryView = !secondaryView;
      try { localStorage.setItem(SECONDARY_KEY, secondaryView ? "1" : "0"); } catch (e) { /* storage unavailable */ }
      syncSecondaryButton();
      render();
    });
    syncSecondaryButton();

    document.getElementById("btn-todays-specialities").addEventListener("click", function () {
      if (!cachedSnapshot || !E.TodaySpecial) return;
      E.TodaySpecial.open(cachedSnapshot, data, yogaOpts());
    });

    window.addEventListener("keydown", function (e) {
      // Not while typing in / scrubbing a field or working in a dialog (the
      // time slider and the alarm dialog use these same keys), and Space on a
      // focused button is that button's click, not a ring switch.
      const target = e.target;
      if (target && target.closest) {
        if (target.closest("input, select, textarea, [role=slider], [role=dialog], [role=alertdialog]")) return;
        if (e.key === " " && target.closest("button, [role=button]")) return;
      }
      if (e.key === "ArrowRight" || e.key === " ") cycleRing(1);
      else if (e.key === "ArrowLeft") cycleRing(-1);
    });
  }

  // Moves the clock to `date`, whatever state it is in: a paused clock stays
  // paused there; a running one keeps ticking forward from it.
  function setViewedTime(date) {
    if (pausedAt) pausedAt = date;
    else timeOffsetMs = date.getTime() - Date.now();
    syncDayControls();
    render();
  }

  // Keeps the day controls (and the time slider) current while the clock runs.
  function startControlSync() {
    setInterval(function () { syncDayControls(); }, 1000);
  }

  // ---- Day and time controls -----------------------------------------------
  // They live in the Location & time widget (location-ui.js): Previous / Next /
  // Pick date / Now, and dragging the sun along the arc. Live is the default.
  // Moving off it holds the clock at that moment (it does not drift on) until
  // Now is pressed. The day buttons change only the date: the clock time on
  // show stays the same.

  function syncTimeUi() {
    syncDayControls();
  }

  function isLive() {
    return !pausedAt && timeOffsetMs === 0;
  }

  function goLive() {
    timeOffsetMs = 0;
    pausedAt = null;
    syncTimeUi();
    render();
  }

  // Holds the clock at `date`.
  function setManualTime(date) {
    pausedAt = date;
    syncTimeUi();
    render();
  }

  const DAY_MS = 86400000;
  function istDayNumber(ms) { return Math.floor((ms + IST_OFFSET_MS) / DAY_MS); }

  // Whole days the date on show is from the real today (IST calendar dates).
  function shownDayOffset() {
    return istDayNumber(getNow().getTime()) - istDayNumber(Date.now());
  }

  // The shown clock time, `days` calendar days from the real today (IST).
  function sameTimeOnDay(days) {
    const shown = getNow().getTime();
    const timeOfDay = (((shown + IST_OFFSET_MS) % DAY_MS) + DAY_MS) % DAY_MS;
    return new Date((istDayNumber(Date.now()) + days) * DAY_MS + timeOfDay - IST_OFFSET_MS);
  }

  // Goes to the day `days` from today,
  // at the clock time on show. Today while live stays live.
  function goToDay(days) {
    if (days === 0 && isLive()) return;
    setManualTime(sameTimeOnDay(days));
  }

  // Goes to sunrise on the day `days` from today (IST): ghaṭī 0, pala 0.
  function goToSunrise(days) {
    const noon = new Date((istDayNumber(Date.now()) + days) * DAY_MS - IST_OFFSET_MS + 12 * 3600000);
    const sunrise = E.Sunrise.sunriseAtOrBefore(settings.location, noon, settings.sunriseEdge);
    if (sunrise instanceof Date && !isNaN(sunrise.getTime())) setManualTime(new Date(sunrise.getTime() + 1500)); // a moment past it, so rounding cannot land before sunrise
    else goToDay(days);
  }

  // Goes to a "YYYY-MM-DD" date (IST), at that day's sunrise.
  function goToDateString(value) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!m) return;
    const picked = Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY_MS;
    goToSunrise(picked - istDayNumber(Date.now()));
  }

  let locationUi = null;
  let syncDayControls = function () { /* set by wireDayControls */ };

  function wireDayControls() {
    syncDayControls = function () {
      if (!cachedSnapshot) return;
      if (locationUi) locationUi.update();
    };
  }

  function wireSettingsPanel() {
    const toggleBtn = document.getElementById("settings-toggle");
    const panel = document.getElementById("settings-panel");
    const ayanamsaSelect = document.getElementById("set-ayanamsa");
    const ringOrderList = document.getElementById("set-ring-order");
    const saveBtn = document.getElementById("settings-save");
    const cancelBtn = document.getElementById("settings-cancel");
    const closeBtn = document.getElementById("settings-close");

    const markerList = document.getElementById("set-markers");

    // Working copies of the ring order and the hidden rings/markers, only
    // committed to `settings` on Save.
    let workingRingOrder = settings.ringOrder.slice();
    let workingHiddenRings = settings.hiddenRings.slice();
    let workingHiddenMarkers = settings.hiddenMarkers.slice();

    // An ↑/↓ reorderable list of `order` (mutated in place), labelled by
    // `titleFor(key)`; `extraFor(key)`, if given, returns content (e.g. a
    // show checkbox) to place before the title, or a falsy value for none.
    function renderReorderList(container, order, titleFor, extraFor) {
      container.innerHTML = "";
      function appendRow(key, reorderable, i) {
        const li = document.createElement("li");
        const label = document.createElement("label");
        const extra = extraFor && extraFor(key);
        if (extra) label.appendChild(extra);
        label.appendChild(document.createTextNode((extra ? " " : "") + titleFor(key)));
        li.appendChild(label);
        if (reorderable) {
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
        }
        container.appendChild(li);
      }
      order.forEach(function (key, i) { appendRow(key, true, i); });
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

    // Fills the form from `from` (the saved settings, or the defaults for
    // Reset to defaults); nothing is committed until Save. The location is not
    // part of this form: it is changed from the pin button on the clock screen.
    function populateForm(from) {
      ayanamsaSelect.value = from.ayanamsa;
      Array.from(document.getElementsByName("calcMethod")).forEach(function (radio) {
        radio.checked = radio.value === from.method;
      });
      Array.from(document.getElementsByName("sunriseEdge")).forEach(function (radio) {
        radio.checked = radio.value === from.sunriseEdge;
      });
      workingRingOrder = from.ringOrder.slice();
      workingHiddenRings = from.hiddenRings.slice();
      workingHiddenMarkers = from.hiddenMarkers.slice();
      document.getElementById("set-yoga-asal-vakya").checked = !!(from.yogaSets && from.yogaSets.asalVakya);
      document.getElementById("set-yoga-regional").checked = from.regionalLimits !== false;
      renderRingOrderList();
      renderCheckboxList(markerList, E.RingAdapter.MARKER_TITLES, workingHiddenMarkers);
    }

    function open() {
      populateForm(settings);
      panel.classList.remove("hidden");
    }
    function close() {
      panel.classList.add("hidden");
    }

    toggleBtn.addEventListener("click", function () {
      if (panel.classList.contains("hidden")) open(); else close();
    });
    cancelBtn.addEventListener("click", close);
    document.getElementById("settings-reset").addEventListener("click", function () {
      populateForm(E.Settings.defaults());
    });

    // Saves the form and closes. The location is kept as it is.
    function saveAndClose() {
      const sunriseEdge = (document.querySelector('input[name="sunriseEdge"]:checked') || {}).value || "upper-limb";
      const method = (document.querySelector('input[name="calcMethod"]:checked') || {}).value || "drik";

      settings = {
        location: settings.location,
        ayanamsa: ayanamsaSelect.value,
        method: method,
        sunriseEdge: sunriseEdge,
        ringOrder: workingRingOrder.slice(),
        hiddenRings: workingHiddenRings.slice(),
        hiddenMarkers: workingHiddenMarkers.slice(),
        yogaSets: { asalVakya: document.getElementById("set-yoga-asal-vakya").checked },
        regionalLimits: document.getElementById("set-yoga-regional").checked,
        layerOrder: settings.layerOrder.slice(),
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

  // The Location & time widget and its Change location dialog (location-ui.js).
  function wireLocation() {
    locationUi = E.LocationUI.init({
      getSettings: function () { return settings; },
      getNow: getNow,
      getAnchors: function () { return cachedSnapshot ? cachedSnapshot.anchors : null; },
      isLive: isLive,
      goLive: goLive,
      shiftDay: function (delta) { goToSunrise(shownDayOffset() + delta); },
      pickDate: goToDateString,
      // Holds the clock at `hours` (0-24, IST) on the date on show.
      setTimeOfDay: function (hours) {
        const dayStart = istDayNumber(getNow().getTime()) * DAY_MS - IST_OFFSET_MS;
        setManualTime(new Date(dayStart + Math.min(hours, 24 - 1 / 60) * 3600000));
      },
      // Applies a place at once: the clock is recomputed for it and it is remembered.
      setLocation: function (loc) {
        settings = Object.assign({}, settings, {
          location: Object.assign({}, settings.location, { latitude: loc.latitude, longitude: loc.longitude, elevation: loc.elevation }),
        });
        E.Settings.save(settings);
        invalidateCache();
        render();
      },
    });
  }

  // The alarm drop-down under the alarm button: opens on tap, closes on a tap elsewhere or Esc.
  function setAlarmMenu(on) {
    const menu = document.getElementById("alarm-section"), btn = document.getElementById("alarm-toggle");
    menu.hidden = !on;
    if (on) document.dispatchEvent(new CustomEvent("dropdown-open", { detail: "alarm" }));
    btn.setAttribute("aria-expanded", String(on));
    btn.classList.toggle("on", on);
  }
  function wireAlarmMenu() {
    const menu = document.getElementById("alarm-section"), btn = document.getElementById("alarm-toggle");
    btn.addEventListener("click", function () { setAlarmMenu(menu.hidden); });
    document.addEventListener("dropdown-open", function (e) { if (e.detail !== "alarm" && !menu.hidden) setAlarmMenu(false); });
    document.addEventListener("pointerdown", function (e) {
      if (!menu.hidden && !menu.contains(e.target) && !btn.contains(e.target) && !document.querySelector(".alarm-modal")) setAlarmMenu(false);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !menu.hidden && !document.querySelector(".alarm-modal")) { setAlarmMenu(false); btn.focus(); }
    });
  }

  // Full screen view: hides every button and widget, leaving only the clock.
  function wireFullView() {
    const btn = document.getElementById("btn-fullview");
    const label = btn.querySelector(".fv-text");
    const body = document.body;
    let idleTimer = null;
    function wake() {
      body.classList.remove("fv-idle");
      clearTimeout(idleTimer);
      if (body.classList.contains("fullview")) idleTimer = setTimeout(function () { body.classList.add("fv-idle"); }, 4000);
    }
    function setFull(on) {
      body.classList.toggle("fullview", on);
      label.textContent = on ? "Show all buttons" : "Full screen";
      btn.title = on ? "Bring back all the buttons" : "Hide all buttons and show only the clock";
      wake();
      if (on) {
        const el = document.documentElement;
        try { if (!document.fullscreenElement && el.requestFullscreen) { const p = el.requestFullscreen(); if (p && p.catch) p.catch(function () {}); } } catch (e) { /* not allowed */ }
      } else {
        try { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen(); } catch (e) { /* ignore */ }
      }
    }
    btn.addEventListener("click", function () { setFull(!body.classList.contains("fullview")); });
    // The button sits left of the day navigator (icon only) in every layout; in full screen
    // view it floats at the top right, so it moves out of the hidden row.
    const row = document.querySelector("#top-controls .tc-row");
    const foot = document.querySelector("#top-controls .tc-foot");
    function place() {
      const inline = !body.classList.contains("fullview");
      btn.classList.toggle("fv-inline", inline);
      if (inline) { if (btn.parentNode !== row) row.insertBefore(btn, row.firstChild); }
      else if (btn.parentNode !== foot) foot.appendChild(btn);
    }
    new MutationObserver(place).observe(body, { attributes: true, attributeFilter: ["class"] });
    place();
    // Leaving browser full screen (e.g. with Esc) also leaves this view.
    document.addEventListener("fullscreenchange", function () {
      if (!document.fullscreenElement && body.classList.contains("fullview")) setFull(false);
    });
    // Ways back with no button on screen: Esc, F, or a double tap/click on the clock.
    window.addEventListener("keydown", function (e) {
      if (!body.classList.contains("fullview")) return;
      if (e.key === "Escape" || e.key === "f" || e.key === "F") setFull(false);
    });
    document.getElementById("dial").addEventListener("dblclick", function () {
      if (body.classList.contains("fullview")) setFull(false);
    });
    // Any movement or touch shows the (fading) button for a few seconds.
    ["pointermove", "pointerdown"].forEach(function (t) {
      window.addEventListener(t, function () { if (body.classList.contains("fullview")) wake(); }, { passive: true });
    });
  }

  async function main() {
    data = await fetch("js/data/panchanga-data.json", { cache: "no-store" }).then(function (r) { return r.json(); });

    const svg = document.getElementById("dial");
    dialHandles = E.Dial.buildStaticStructure(svg);
    E.Dial.setLayerOrder(settings.layerOrder);

    wireInput(svg);
    startControlSync();
    wireDayControls();
    wireSettingsPanel();
    wireLocation();
    wireFullView();
    wireAlarmMenu();
    // Alarms are an add-on: if they fail to start, the clock itself carries on.
    let alarmsOk = false;
    try {
      E.AlarmUI.init({
        getSettings: function () { return settings; },
        getData: function () { return data; },
        onSetClick: function () { setAlarmMenu(false); },
      });
      alarmsOk = true;
    } catch (err) {
      console.error("Alarms failed to start:", err);
    }
    // In the Android app: tell it this page started properly. If it never does (e.g. a broken
    // update fetched from the site), the app falls back to the copy bundled in the APK.
    if (alarmsOk && window.AndroidAlarms && E.AndroidBridge) {
      try { window.AndroidAlarms.booted(); } catch (err) { /* an older app without booted() */ }
      E.AndroidBridge.startWidgets({
        getSettings: function () { return settings; },
        getData: function () { return data; },
      });
    }

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
