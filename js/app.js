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

    if (changed) {
      // Good/bad times and day/night only depend on the snapshot, never on
      // which switchable ring is toggled, so they're rebuilt whenever the
      // snapshot itself changes.
      lastGoodBad = E.RingAdapter.buildGoodBadTimes(snapshot, data);
      E.Dial.renderDayNightRing(dialHandles.dayNightRingGroup, E.RingAdapter.buildDayNight(snapshot));
      E.Dial.renderDayMarkers(dialHandles.markerGroup, E.RingAdapter.buildDayMarkers(snapshot, data, settings.hiddenMarkers));
      applyFixedRingVisibility();
    }
    // The Good / Bad Times ring also depends on which halves are switched on.
    const showKey = (show.good ? "g" : "-") + (show.bad ? "b" : "-");
    if (changed || showKey !== lastShowKey) {
      E.Dial.renderGoodBadRing(dialHandles.goodBadRingGroup, lastGoodBad.good, lastGoodBad.bad, show);
      lastShowKey = showKey;
    }
    if (changed || ringKey !== lastRenderedRingKey) {
      if (ringKey) {
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
    E.Dial.setCentreText(dialHandles.centreGroup, buildCentreLines(now, snapshot, lastOuterRingDescriptor, ghatiNow));
    updateSwitchLabel();
    if (changed || !controlsSynced) { controlsSynced = true; syncDayControls(); }
  }
  let controlsSynced = false;

  // "Next (<ring>)" / "Previous (<ring>)" on the display buttons.
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
    document.getElementById("btn-next-display").textContent = next ? "Next (" + next + ")" : "Next";
    document.getElementById("btn-prev-display").textContent = prev ? "Previous (" + prev + ")" : "Previous";
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
    if (!activeRingOrder.length) return;
    currentRingIndex = (currentRingIndex + delta + activeRingOrder.length) % activeRingOrder.length;
    render();
  }

  function wireInput(svg) {
    // Tapping the dial itself no longer cycles the ring (per the project
    // owner) - so a tap on a segment just shows its tooltip. The buttons
    // below / beside the clock, swipes and arrow keys do it instead.
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
    document.getElementById("btn-switch-time").addEventListener("click", toggleTimeMode);
    document.getElementById("btn-next-display").addEventListener("click", function () { cycleRing(1); });
    document.getElementById("btn-prev-display").addEventListener("click", function () { cycleRing(-1); });
    document.getElementById("btn-show-good").addEventListener("click", function () { setShown("good", !show.good); });
    document.getElementById("btn-show-bad").addEventListener("click", function () { setShown("bad", !show.bad); });
    syncShowButtons();

    window.addEventListener("keydown", function (e) {
      // Not while typing in / scrubbing a field or working in a dialog (the
      // time slider and the alarm dialog use these same keys), and Space on a
      // focused button is that button's click, not a ring switch.
      const target = e.target;
      if (target && target.closest) {
        if (target.closest("input, select, textarea, [role=dialog], [role=alertdialog]")) return;
        if (e.key === " " && target.closest("button")) return;
      }
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

  // ---- Yesterday / Today / Tomorrow, the time slider and Now ---------------
  // They sit beside the settings gear. Live is the default: the slider
  // follows the real time. Moving the slider, or pressing a day button, holds
  // the clock at that moment (it does not drift on) until Now is pressed.
  // The day buttons change only the date: the clock time on show stays the
  // same. The slider scrubs the Vedic day on show - sunrise at the left, the
  // next sunrise at the right - its track coloured like the Day / Night ring.

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

  let scrubbing = false;
  let syncDayControls = function () { /* set by wireDayControls */ };

  function wireDayControls() {
    const prevBtn = document.getElementById("day-prev");
    const todayBtn = document.getElementById("day-today");
    const nextBtn = document.getElementById("day-next");
    const slider = document.getElementById("time-slider");
    const scrub = document.getElementById("time-scrub");
    const readout = document.getElementById("scrub-readout");
    const nowBtn = document.getElementById("scrub-now");
    const sunriseLabel = document.getElementById("scrub-sunrise");
    const sunsetLabel = document.getElementById("scrub-sunset");

    prevBtn.addEventListener("click", function () { goToDay(shownDayOffset() - 1); });
    nextBtn.addEventListener("click", function () { goToDay(shownDayOffset() + 1); });
    todayBtn.addEventListener("click", function () { goToDay(0); });
    nowBtn.addEventListener("click", goLive);

    // The date button: a transparent native date field laid over it, so a
    // tap opens the system date dialog. Picking a date goes to that day at
    // the clock time on show (like the day buttons).
    const picker = document.getElementById("date-pick-input");
    picker.addEventListener("change", function () {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(picker.value);
      if (!m) return;
      const picked = Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY_MS;
      goToDay(picked - istDayNumber(Date.now()));
    });

    syncDayControls = function () {
      if (!cachedSnapshot) return;
      const a = cachedSnapshot.anchors;
      const now = getNow();
      const sunrise = a.governingSunrise.getTime();

      // Which day is on show, against the real today.
      const offset = shownDayOffset();
      todayBtn.classList.toggle("on", offset === 0);
      todayBtn.setAttribute("aria-pressed", String(offset === 0));
      // The picker opens on the date on show.
      const shownIst = new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
      if (picker.value !== shownIst && document.activeElement !== picker) picker.value = shownIst;
      const live = isLive();
      nowBtn.classList.toggle("is-live", live);
      nowBtn.setAttribute("aria-pressed", String(live));

      // Slider: one step per minute across this Vedic day (the last step
      // stays just short of the next sunrise, which would be the next day).
      const max = Math.max(1, Math.floor((a.nextSunrise.getTime() - sunrise) / 60000) - 1);
      if (slider.max !== String(max)) slider.max = String(max);
      const dayFrac = (a.sunsetToday.getTime() - sunrise) / (a.nextSunrise.getTime() - sunrise);
      scrub.style.setProperty("--day-frac", (dayFrac * 100).toFixed(2) + "%");
      sunriseLabel.textContent = "\u2600\u2191 " + fmtTime(a.governingSunrise);
      sunsetLabel.textContent = "\u2600\u2193 " + fmtTime(a.sunsetToday);
      readout.textContent = now.toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short" }) + " \u00b7 " + fmtTime(now);
      if (!scrubbing) {
        slider.value = String(Math.max(0, Math.min(max, Math.floor((now.getTime() - sunrise) / 60000))));
      }
      slider.setAttribute("aria-valuetext", readout.textContent);
    };

    slider.addEventListener("input", function () {
      if (!cachedSnapshot) return;
      setManualTime(new Date(cachedSnapshot.anchors.governingSunrise.getTime() + Number(slider.value) * 60000));
    });
    ["pointerdown", "touchstart"].forEach(function (type) {
      slider.addEventListener(type, function () { scrubbing = true; }, { passive: true });
    });
    ["pointerup", "pointercancel", "touchend", "touchcancel", "blur", "change"].forEach(function (type) {
      slider.addEventListener(type, function () { scrubbing = false; });
    });
  }

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
    // Reset to defaults); nothing is committed until Save.
    function populateForm(from) {
      placeInput.value = "";
      latInput.value = from.location.latitude;
      lonInput.value = from.location.longitude;
      elevInput.value = from.location.elevation;
      ayanamsaSelect.value = from.ayanamsa;
      Array.from(document.getElementsByName("sunriseEdge")).forEach(function (radio) {
        radio.checked = radio.value === from.sunriseEdge;
      });
      workingRingOrder = from.ringOrder.slice();
      workingHiddenRings = from.hiddenRings.slice();
      workingHiddenMarkers = from.hiddenMarkers.slice();
      renderRingOrderList();
      renderCheckboxList(markerList, E.RingAdapter.MARKER_TITLES, workingHiddenMarkers);
    }

    // First visit: only Location (and Save) work until a location is saved; that first
    // location becomes the default automatically. Everything else is inert and dimmed.
    let locationLocked = E.Settings.needsLocation();
    const stage = document.getElementById("stage");
    const lockedButtons = [closeBtn, cancelBtn, document.getElementById("settings-reset"), resetLocationBtn, document.getElementById("set-location-default")];
    function applyLock() {
      const locationSection = document.getElementById("set-place").closest("section");
      panel.querySelectorAll("section").forEach(function (sec) {
        const lock = locationLocked && sec !== locationSection;
        sec.classList.toggle("locked", lock);
        if (lock) sec.setAttribute("inert", ""); else sec.removeAttribute("inert");
      });
      if (locationLocked) stage.setAttribute("inert", ""); else stage.removeAttribute("inert");
      lockedButtons.forEach(function (b) { b.disabled = locationLocked; });
      refreshLocationState();
    }

    function open() {
      populateForm(settings);
      if (locationLocked) {
        latInput.value = "";
        lonInput.value = "";
        elevInput.value = "";
      }
      panel.classList.remove("hidden");
      refreshLocationState();
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
      refreshLocationState();
    });

    // ---- Location: searchable place picker (themed dropdown), default location
    const placeInput = document.getElementById("set-place");
    const placeResults = document.getElementById("set-place-results");
    const setDefaultBtn = document.getElementById("set-location-default");
    const defaultNote = document.getElementById("set-default-note");
    const fmtCoords = function (lat, lon) { return lat + "°N, " + lon + "°E"; };
    let shown = [];      // places currently listed
    let activeIdx = -1;  // highlighted row

    function hideResults() {
      placeResults.classList.add("hidden");
      placeInput.setAttribute("aria-expanded", "false");
      placeInput.removeAttribute("aria-activedescendant");
      activeIdx = -1;
    }
    function setActive(i) {
      const rows = placeResults.querySelectorAll("li[data-i]");
      if (!rows.length) return;
      activeIdx = (i + rows.length) % rows.length;
      rows.forEach(function (li, k) {
        li.classList.toggle("active", k === activeIdx);
        li.setAttribute("aria-selected", k === activeIdx ? "true" : "false");
      });
      const li = rows[activeIdx];
      placeInput.setAttribute("aria-activedescendant", li.id);
      li.scrollIntoView({ block: "nearest" });
    }
    function showResults() {
      const q = placeInput.value;
      placeResults.textContent = "";
      shown = E.IndiaPlaces.search(q, 12);
      if (!q.trim()) { hideResults(); return; }
      if (!shown.length) {
        const li = document.createElement("li");
        li.className = "empty";
        li.textContent = "No match - try another spelling";
        placeResults.appendChild(li);
      }
      shown.forEach(function (p, i) {
        const li = document.createElement("li");
        li.id = "set-place-opt-" + i;
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
        // mousedown (not click) so it runs before the input loses focus
        li.addEventListener("mousedown", function (ev) { ev.preventDefault(); choose(p); });
        placeResults.appendChild(li);
      });
      placeResults.classList.remove("hidden");
      placeInput.setAttribute("aria-expanded", "true");
      if (shown.length) setActive(0);
    }
    function choose(p) {
      latInput.value = p.latitude;
      lonInput.value = p.longitude;
      elevInput.value = p.elevation;
      placeInput.value = "";   // the "Current location" label shows what was chosen
      hideResults();
      refreshLocationState();
    }
    placeInput.addEventListener("input", showResults);
    placeInput.addEventListener("focus", function () { if (placeInput.value.trim()) showResults(); });
    placeInput.addEventListener("blur", function () {
      hideResults();
      // A full name typed or pasted without picking from the list still counts.
      const p = E.IndiaPlaces.find(placeInput.value);
      if (p) choose(p);
    });
    placeInput.addEventListener("keydown", function (ev) {
      const open = !placeResults.classList.contains("hidden");
      if (ev.key === "ArrowDown") { ev.preventDefault(); if (!open) showResults(); else setActive(activeIdx + 1); }
      else if (ev.key === "ArrowUp") { ev.preventDefault(); if (open) setActive(activeIdx - 1); }
      else if (ev.key === "Enter") {
        if (open && shown[activeIdx]) { ev.preventDefault(); choose(shown[activeIdx]); }
      } else if (ev.key === "Escape" && open) { ev.stopPropagation(); hideResults(); }
    });

    // "Current location" label under the search box, and Set as default only when the
    // location in the form differs from the default.
    const currentName = document.getElementById("set-current-name");
    const currentCoords = document.getElementById("set-current-coords");
    function placeAt(lat, lon) {
      const near = function (a, b) { return Math.abs(a - b) < 1e-4; };
      return E.IndiaPlaces.PLACES.filter(function (q) { return near(q.latitude, lat) && near(q.longitude, lon); })[0] || null;
    }
    function nameFor(lat, lon) {
      const near = function (a, b) { return Math.abs(a - b) < 1e-4; };
      const p = placeAt(lat, lon);
      if (p) return p.label;
      const d = E.Settings.defaultLocation();
      return near(d.latitude, lat) && near(d.longitude, lon) ? d.name : "Custom location";
    }
    function refreshLocationState() {
      const lat = parseFloat(latInput.value), lon = parseFloat(lonInput.value), elev = parseFloat(elevInput.value);
      const valid = isFinite(lat) && Math.abs(lat) <= 90 && isFinite(lon) && Math.abs(lon) <= 180;
      if (!valid) {
        currentName.textContent = "Not chosen yet";
        currentCoords.textContent = "";
        setDefaultBtn.disabled = true;
        return;
      }
      currentName.textContent = nameFor(lat, lon);
      currentCoords.textContent = "\u00b7 " + fmtCoords(lat, lon) + (isFinite(elev) ? ", " + elev + " m" : "");
      const d = E.Settings.defaultLocation();
      const same = Math.abs(lat - d.latitude) < 1e-4 && Math.abs(lon - d.longitude) < 1e-4 && isFinite(elev) && Math.abs(elev - d.elevation) < 0.5;
      setDefaultBtn.disabled = locationLocked || same || !isFinite(elev) || elev < 0;
    }
    [latInput, lonInput, elevInput].forEach(function (el) { el.addEventListener("input", refreshLocationState); });

    function refreshDefaultLabels() {
      const d = E.Settings.defaultLocation();
      resetLocationBtn.textContent = locationLocked ? "Reset to default" : "Reset to " + d.name;
      resetLocationBtn.title = fmtCoords(d.latitude, d.longitude) + ", " + d.elevation + " m";
    }
    // The form's location as { name, latitude, longitude, elevation }, or null (focusing the bad field).
    // Named after the chosen place when the fields still hold its coordinates.
    function formLocation() {
      const lat = parseFloat(latInput.value);
      const lon = parseFloat(lonInput.value);
      const elev = parseFloat(elevInput.value);
      if (!isFinite(lat) || lat < -90 || lat > 90) { latInput.focus(); return null; }
      if (!isFinite(lon) || lon < -180 || lon > 180) { lonInput.focus(); return null; }
      if (!isFinite(elev) || elev < 0) { elevInput.focus(); return null; }
      const p = placeAt(lat, lon);
      const name = p ? (p.kind === "district" ? p.name + " (district)" : p.name) : fmtCoords(lat, lon);
      return { name: name, latitude: lat, longitude: lon, elevation: elev };
    }

    setDefaultBtn.addEventListener("click", function () {
      const loc = formLocation();
      if (!loc) return;
      if (E.Settings.setDefaultLocation(loc)) {
        refreshDefaultLabels();
        refreshLocationState();
        defaultNote.textContent = "Default is now " + loc.name + ". Reset returns here.";
      } else {
        defaultNote.textContent = "Couldn't save - browser storage unavailable.";
      }
    });

    resetLocationBtn.addEventListener("click", function () {
      placeInput.value = "";
      hideResults();
      const d = E.Settings.defaultLocation();
      latInput.value = d.latitude;
      lonInput.value = d.longitude;
      elevInput.value = d.elevation;
      refreshLocationState();
    });

    // Returns true on success (and closes), false if validation failed (stays open).
    function saveAndClose() {
      const loc = formLocation();
      if (!loc) return false;
      const lat = loc.latitude, lon = loc.longitude, elev = loc.elevation;

      const sunriseEdge = (document.querySelector('input[name="sunriseEdge"]:checked') || {}).value || "upper-limb";

      settings = {
        location: Object.assign({}, settings.location, { latitude: lat, longitude: lon, elevation: elev }),
        ayanamsa: ayanamsaSelect.value,
        sunriseEdge: sunriseEdge,
        ringOrder: workingRingOrder.slice(),
        hiddenRings: workingHiddenRings.slice(),
        hiddenMarkers: workingHiddenMarkers.slice(),
        layerOrder: settings.layerOrder.slice(),
      };
      E.Settings.save(settings);
      if (locationLocked) {
        // The first location entered becomes the default, and the rest of the app unlocks.
        E.Settings.setDefaultLocation(loc);
        locationLocked = false;
        applyLock();
        refreshDefaultLabels();
        defaultNote.textContent = "Default is now " + loc.name + ". Reset returns here.";
      }
      E.Dial.setLayerOrder(settings.layerOrder);
      activeRingOrder = visibleRingOrder();
      currentRingIndex = 0;
      invalidateCache();
      render();
      close();
      return true;
    }

    saveBtn.addEventListener("click", saveAndClose);

    refreshDefaultLabels();
    applyLock();
    if (locationLocked) {
      defaultNote.textContent = "Your first saved location becomes the default.";
      open();
      placeInput.focus();
    }
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
    startControlSync();
    wireDayControls();
    wireSettingsPanel();
    // Alarms are an add-on: if they fail to start, the clock itself carries on.
    let alarmsOk = false;
    try {
      E.AlarmUI.init({
        getSettings: function () { return settings; },
        getData: function () { return data; },
        // The next-alarm chip beside the gear opens Settings, where alarms live.
        onChipClick: function () {
          const panel = document.getElementById("settings-panel");
          if (panel.classList.contains("hidden")) document.getElementById("settings-toggle").click();
        },
      });
      alarmsOk = true;
    } catch (err) {
      console.error("Alarms failed to start:", err);
    }
    // In the Android app: tell it this page started properly. If it never does (e.g. a broken
    // update fetched from the site), the app falls back to the copy bundled in the APK.
    if (alarmsOk && window.AndroidAlarms && E.AndroidBridge) {
      try { window.AndroidAlarms.booted(); } catch (err) { /* an older app without booted() */ }
      E.AndroidBridge.startLockClock({
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
