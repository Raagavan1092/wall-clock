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
  E.Zone.set(settings.location.timezone); // every time on the clock is in the place's own zone
  // The script names are drawn in (js/script.js); N() writes a name in it.
  E.Script.set(settings.script);
  const N = E.Script.name;
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
  // The check buttons that switched them are retired for now (commented out
  // here, in wireInput / applyFixedRingVisibility, and in app.html), so both
  // halves always show; uncomment those blocks to bring them back.
  const show = { good: true, bad: true };
  /* const SHOW_GOOD_KEY = "vedicWallClock.showGood", SHOW_BAD_KEY = "vedicWallClock.showBad";
  try {
    if (localStorage.getItem(SHOW_GOOD_KEY) === "0") show.good = false;
    if (localStorage.getItem(SHOW_BAD_KEY) === "0") show.bad = false;
  } catch (e) { } */
  let lastShowKey = null;

  // "Secondary yogas": the dial shows the tithi-vāra-nakṣatra yogas on the
  // Good / Bad Times ring, with no switchable ring. A viewing preference.
  const SECONDARY_KEY = "vedicWallClock.secondaryYogas";
  let secondaryView = false;
  try { secondaryView = localStorage.getItem(SECONDARY_KEY) === "1"; } catch (e) { /* storage unavailable */ }
  let lastSecondaryView = null;

  // The "Outer ring" / "Good / bad" switches in the Today panel: show or hide the switchable rings and the
  // Good / Bad windows in the main view. Viewing preferences, remembered.
  const RINGS_KEY = "vedicWallClock.showRings", WINDOWS_KEY = "vedicWallClock.showWindows";
  const PANEL_OPEN_KEY = "vedicWallClock.todayPanelOpen";
  let ringsOn = true, windowsOn = false; // the Good / bad windows start off; a saved choice wins
  try {
    if (localStorage.getItem(RINGS_KEY) === "0") ringsOn = false;
    if (localStorage.getItem(WINDOWS_KEY) === "1") windowsOn = true;
  } catch (e) { /* storage unavailable */ }
  let lastLayoutKey = null;

  function yogaOpts() {
    return { janma: settings.janma, yogaSets: settings.yogaSets, regionalLimits: settings.regionalLimits !== false, descriptive: !!settings.descriptiveTips };
  }

  let data = null;
  let dialHandles = null;
  let lastRenderedRingKey = null;
  let lastOuterRingDescriptor = null;
  let lastGoodBad = null;

  const VARA_FALLBACK = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  function fmtTime(date) {
    return date.toLocaleTimeString("en-IN", { timeZone: E.Zone.intl(), hour12: false, hour: "2-digit", minute: "2-digit" });
  }

  // A time for the centre readout, with " (Nov 3)" after it when it falls
  // after midnight on the next date (see RingAdapter.dateNote).
  function fmtTimeD(date, snapshot) {
    return fmtTime(date) + E.RingAdapter.dateNote(date, snapshot.anchors);
  }

  // The tithi / nakṣatra / yoga / karaṇa entry of a day's sequence that holds at `now`.
  function currentIn(sequence, now) {
    return sequence.find(function (e) { return e.segStart <= now && now < e.segEnd; }) || sequence[0];
  }

  // The instant whose tithi and nakṣatra the Today panel shows. Rituals go by those at
  // sunrise, so in edit mode, where the hand is dragged about the day, they stay those
  // of the day's sunrise instead of following the hand.
  function tithiNakTime(now, snapshot) {
    return editMode ? snapshot.anchors.governingSunrise : now;
  }

  // The centre of the clock: the time in both conventions and the window running now.
  // The date, the pañcāṅga and the outer ring's state are in the Today panel beside or
  // under the clock (buildPanelModel); in the full screen view, where only the clock is
  // on screen, they are written in the centre as well.
  function buildCentreLines(now, snapshot, ringDescriptor, ghatiNow) {
    const full = document.body.classList.contains("fullview");
    // `ghatiNow`, not `snapshot.ghati`: the snapshot is cached for hours at a
    // time (see getSnapshot/isExpired above), so snapshot.ghati is whatever
    // it was AT CACHE TIME - reading it here left this readout frozen between
    // cache refreshes. `ghatiNow` is recomputed fresh every render() call,
    // same as the hand angle.
    const g = ghatiNow;

    // Ghati/pala leads by default (this is a Vedic clock first), with the
    // modern clock as the smaller line underneath; "Switch time" swaps them.
    const clockText = now.toLocaleTimeString("en-IN", { timeZone: E.Zone.intl(), hour12: false });
    const lines = timeMode === "hour"
      ? [
          { text: clockText, emphasis: "ghati" },
          { text: N("Ghaṭī") + " " + g.ghati + " · " + N("Pala") + " " + g.pala + " · " + N("Vipala") + " " + g.vipala, emphasis: "clock-secondary" },
        ]
      : [
          { text: N("Ghaṭī") + " " + g.ghati + " · " + N("Pala") + " " + g.pala, subText: " · " + N("Vipala") + " " + g.vipala, emphasis: "ghati" },
          { text: clockText, emphasis: "clock-secondary" },
        ];
    if (full) {
      // The day: date and vāra on one line, the tithi (with pakṣa) and nakṣatra holding now on the next.
      const varaName = (data.vara.names && data.vara.names[snapshot.varaIndex]) || VARA_FALLBACK[snapshot.varaIndex];
      const dateText = now.toLocaleDateString("en-GB", { timeZone: E.Zone.intl(), day: "numeric", month: "short", year: "numeric" });
      const nak = currentIn(snapshot.nakshatraSequence, now);
      lines.push({ text: dateText + " · " + N(varaName) });
      lines.push({ text: N(E.RingAdapter.tithiNameAt(snapshot, data, now)) + " · " + N(data.nakshatra.names[nak.index]) });
    }

    // The Good / Bad Times ring's status: what is running now (bad first, the one
    // people check, then good) and until when; with nothing running, what comes next.
    if (lastGoodBad && settings.hiddenRings.indexOf("goodBad") === -1 && (secondaryView || windowsOn)) {
      const rows = [["bad", lastGoodBad.bad, "⚠\uFE0E "], ["good", lastGoodBad.good, "✓ "]].map(function (row) {
        return { kind: row[0], mark: row[2], st: E.RingAdapter.statusFor(row[1], now) };
      });
      const active = rows.filter(function (r) { return r.st && r.st.active; });
      lines.push({ text: "", emphasis: "gap" });
      if (active.length) {
        // Beside the Today panel the line is kept short (the panel has the date of a time after midnight).
        active.forEach(function (r) { lines.push({ text: r.mark + N(r.st.text) + " · till " + (full ? fmtTimeD(r.st.until, snapshot) : fmtTime(r.st.until)), emphasis: r.kind }); });
      } else {
        const upcoming = rows.filter(function (r) { return r.st; }).sort(function (x, y) { return x.st.at - y.st.at; });
        if (!upcoming.length) lines.push({ text: "No more windows today", emphasis: "muted" });
        else (full ? upcoming : upcoming.slice(0, 1)).forEach(function (r) {
          lines.push({ text: "Next " + r.kind + ": " + N(r.st.text) + " @ " + (full ? fmtTimeD(r.st.at, snapshot) : fmtTime(r.st.at)), emphasis: "muted" });
        });
      }
    }
    if (!full) return lines;

    if (secondaryView) {
      lines.push({ text: "", emphasis: "gap" });
      lines.push({ text: "Secondary yogas", emphasis: "ring" });
      return lines;
    }

    // Now/next for the active switchable ring, on two lines. Kāla has a
    // blank (unlabelled) night band - name just the ring there rather than
    // show a bare "Kāla: ", and look past blank segment(s) for "next".
    if (!ringDescriptor || !ringsOn) return lines; // every switchable ring hidden, or turned off
    const nextSeg = ringDescriptor.segments.find(function (seg) {
      return seg.startTime > now && seg.text;
    });
    // The current division is already highlighted on the dial, so the centre
    // names the ring (highlighted) and says only when the next one starts.
    lines.push({ text: "", emphasis: "gap" });
    lines.push({ text: "Current Ring: " + N(ringDescriptor.title), emphasis: "ring" });
    if (nextSeg) lines.push({ text: "next " + N(nextSeg.text) + " " + fmtTimeD(nextSeg.startTime, snapshot) });
    return lines;
  }

  // What the Today panel shows (js/today-panel.js draws it).
  function buildPanelModel(now, snapshot, ringDescriptor) {
    const a = snapshot.anchors;
    function till(entry) { const end = entry.endTime || entry.segEnd; return "till " + fmtTimeD(end, snapshot); }
    const varaName = (data.vara.names && data.vara.names[snapshot.varaIndex]) || VARA_FALLBACK[snapshot.varaIndex];
    const held = tithiNakTime(now, snapshot);
    const tithi = currentIn(snapshot.tithiSequence, held), nak = currentIn(snapshot.nakshatraSequence, held);
    const yoga = currentIn(snapshot.yogaSequence, now), karana = currentIn(snapshot.karanaSequence, now);
    const karanaName = karana.key.indexOf("movable:") === 0 ? data.karana.movable[Number(karana.key.split(":")[1])] : data.karana.fixed[karana.key];
    // The saura (solar) month: the sidereal rashi the Sun is in, from one saṅkrānti to the next.
    const sauraRashi = Math.floor(E.Util.normDeg(E.Sidereal.longitude("sun", held, settings.ayanamsa, settings.method)) / 30);
    const sankranti = snapshot.dayEvents && snapshot.dayEvents.sankranti;
    const model = {
      date: now.toLocaleDateString("en-GB", { timeZone: E.Zone.intl(), day: "numeric", month: "short", year: "numeric" }),
      vara: N(varaName),
      offset: offsetLabel(),
      // Away from India the zone is named, so a time is never mistaken for IST.
      sun: "Sunrise " + fmtTime(a.governingSunrise) + " · Sunset " + fmtTime(a.sunsetToday) + (E.Zone.id() === E.Zone.DEFAULT ? "" : " · " + E.Zone.abbr(now.getTime())),
      rows: [
        { k: N("Tithi"), v: N(E.RingAdapter.tithiNameAt(snapshot, data, held)), till: till(tithi) },
        { k: N("Nakṣatra"), v: N(data.nakshatra.names[nak.index]), till: till(nak) },
        { k: N("Yoga"), v: N(data.yoga.names[yoga.index]), till: till(yoga) },
        { k: N("Karaṇa"), v: N(karanaName), till: till(karana) },
        { k: N("Chāndra māsa"), v: N(data.amantaMasa.names[tithi.amantaMasaRashiIndex]) + " (amānta)", till: "" },
        { k: N("Saura māsa"), v: N(data.rashi.names[sauraRashi]), till: sankranti && sankranti.time.getTime() > held.getTime() ? "till " + fmtTimeD(sankranti.time, snapshot) : "" },
      ],
      nowTitle: secondaryView ? "SECONDARY YOGAS NOW" : "GOOD AND BAD TIMES NOW",
      now: [],
      ring: null,
    };
    // Every window running now (bad first), then the next of each kind.
    if (lastGoodBad) {
      const t = now.getTime();
      const next = [];
      [["bad", lastGoodBad.bad], ["good", lastGoodBad.good]].forEach(function (pair) {
        const events = pair[1].segments;
        events.filter(function (e) { return e.startTime <= t && t < e.endTime; })
          .sort(function (x, y) { return x.endTime - y.endTime; })
          .forEach(function (e) { model.now.push({ kind: pair[0], text: N(e.text), when: "till " + fmtTimeD(e.endTime, snapshot) }); });
        const upcoming = events.filter(function (e) { return e.startTime > t; }).sort(function (x, y) { return x.startTime - y.startTime; })[0];
        if (upcoming) next.push({ kind: "next-" + pair[0], text: "Next " + pair[0] + ": " + N(upcoming.text), when: "at " + fmtTimeD(upcoming.startTime, snapshot), at: upcoming.startTime.getTime() });
      });
      if (!model.now.length) model.now.push({ kind: "none", text: "Nothing running now", when: "" });
      next.sort(function (x, y) { return x.at - y.at; }).forEach(function (n) { model.now.push({ kind: n.kind, text: n.text, when: n.when }); });
    }
    // The outer ring: what it shows, the division holding now and when the next starts.
    if (ringDescriptor && ringsOn && !secondaryView) {
      const cur = ringDescriptor.segments.find(function (seg) { return seg.startTime <= now && now < seg.endTime && seg.text; });
      const nextSeg = ringDescriptor.segments.find(function (seg) { return seg.startTime > now && seg.text; });
      model.ring = {
        name: N(ringDescriptor.title) + (cur ? " · " + N(cur.text) : ""),
        next: nextSeg ? "next " + N(nextSeg.text) + " at " + fmtTimeD(nextSeg.startTime, snapshot) : "",
      };
    }
    return model;
  }

  function render() {
    const now = getNow();
    const { snapshot, changed } = getSnapshot(now);
    const ringKey = activeRingOrder[currentRingIndex];

    const layoutKey = (ringsOn ? "r" : "-") + (windowsOn ? "w" : "-");
    let viewChanged = secondaryView !== lastSecondaryView || layoutKey !== lastLayoutKey;
    if (viewChanged) {
      E.Dial.setLayout(ringsOn, windowsOn);
      E.Dial.setSecondaryMode(secondaryView);
      document.body.classList.toggle("secondary-view", secondaryView);
      document.body.classList.toggle("rings-off", !ringsOn);
      lastSecondaryView = secondaryView;
      lastLayoutKey = layoutKey;
    }
    // The dial changed size on screen (or its view box did): labels are redrawn at a
    // readable size, and those that cannot have one are left out (Dial.updateScale).
    let scaleChanged = false;
    if (scaleDirty || viewChanged) {
      scaleDirty = false;
      scaleChanged = E.Dial.updateScale();
      if (scaleChanged) lastRenderedTimeMode = null;
    }
    viewChanged = viewChanged || scaleChanged; // from here on: everything on the dial is redrawn
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
      if (ringKey && !secondaryView && ringsOn) {
        lastOuterRingDescriptor = E.RingAdapter.build(ringKey, snapshot, data);
        E.Dial.renderOuterRing(dialHandles.outerRingGroup, lastOuterRingDescriptor, E.RingAdapter.START_LABEL_RINGS);
      } else {
        lastOuterRingDescriptor = null;
        E.Dial.clearGroup(dialHandles.outerRingGroup);
      }
      lastRenderedRingKey = ringKey;
    }

    // The scale under the hands: 60 ghatis, or (hour mode) 24 clock
    // hours (the place's own time) placed on the same sunrise-anchored angles, so no ring moves.
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
    // 24 min) or, in hour mode, a minute hand (one turn per clock hour).
    E.Dial.setHand(dialHandles.handGroup, ghatiNow.angleDeg);
    E.Dial.setPalaHand(dialHandles.palaHandGroup, timeMode === "hour" ? minuteAngle(now) : ghatiNow.palaAngleDeg);
    E.Dial.setCentreText(dialHandles.centreGroup, buildCentreLines(now, snapshot, lastOuterRingDescriptor, ghatiNow), dialHandles.switchGroup);
    E.Dial.setSwitchLabel(dialHandles.switchGroup, timeMode === "hour" ? "Switch to " + (E.Script.get() === "iast" ? "ghaṭī" : N("Ghaṭī")) : "Switch to hours");
    if (!document.body.classList.contains("fullview")) E.TodayPanel.update(buildPanelModel(now, snapshot, lastOuterRingDescriptor));
    updateSwitchLabel();
    if (changed || !controlsSynced) { controlsSynced = true; syncDayControls(); }
  }
  let controlsSynced = false;
  let scaleDirty = true; // set whenever the dial's size on screen changes (main)

  // "Next ring (<ring>)" / "Previous ring (<ring>)" on the corner buttons by the dial.
  let lastSwitchLabel = null;
  function updateSwitchLabel() {
    const n = activeRingOrder.length;
    function title(delta) {
      const k = n ? activeRingOrder[(currentRingIndex + delta + n) % n] : null;
      return k ? N(E.RingAdapter.RING_TITLES[k] || k) : "";
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

  function minuteAngle(now) {
    const msIntoHour = (now.getTime() + E.Zone.offsetMs(now.getTime())) % 3600000;
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
    if (!secondaryView && !windowsOn) groups.goodBad.style.display = "none";
    // With the Good / Bad Times ring hidden in Settings its toggles have nothing to do.
    /* Retired good/bad check buttons:
    const goodBadOn = settings.hiddenRings.indexOf("goodBad") === -1;
    document.getElementById("btn-show-good").hidden = !goodBadOn;
    document.getElementById("btn-show-bad").hidden = !goodBadOn;
    */
  }

  function cycleRing(delta) {
    if (!activeRingOrder.length || secondaryView || !ringsOn) return;
    currentRingIndex = (currentRingIndex + delta + activeRingOrder.length) % activeRingOrder.length;
    render();
  }

  function wireInput(svg) {
    // Tapping the dial itself no longer cycles the ring (per the project
    // owner) - so a tap on a segment just shows its tooltip. The buttons
    // below / beside the clock and arrow keys do it instead (no swiping).
    /* Retired good/bad check buttons:
    function setShown(kind, on) {
      show[kind] = on;
      try { localStorage.setItem(kind === "good" ? SHOW_GOOD_KEY : SHOW_BAD_KEY, on ? "1" : "0"); } catch (e) { }
      syncShowButtons();
      render();
    }
    function syncShowButtons() {
      document.getElementById("btn-show-good").setAttribute("aria-checked", String(show.good));
      document.getElementById("btn-show-bad").setAttribute("aria-checked", String(show.bad));
    }
    */
    const switchBtn = document.getElementById("btn-switch-time");
    switchBtn.addEventListener("click", toggleTimeMode);
    switchBtn.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleTimeMode(); }
    });
    document.getElementById("btn-next-display").addEventListener("click", function () { cycleRing(1); });
    document.getElementById("btn-prev-display").addEventListener("click", function () { cycleRing(-1); });
    /* Retired good/bad check buttons:
    document.getElementById("btn-show-good").addEventListener("click", function () { setShown("good", !show.good); });
    document.getElementById("btn-show-bad").addEventListener("click", function () { setShown("bad", !show.bad); });
    syncShowButtons();
    */

    const secBtn = document.getElementById("btn-secondary-yogas");
    function syncSecondaryButton() {
      secBtn.textContent = secondaryView ? "Main view" : "Secondary yogas";
      secBtn.title = secondaryView ? "Back to the daily windows and the switchable rings" : "Show the tithi-vāra-nakṣatra yogas";
    }
    secBtn.addEventListener("click", function () {
      secondaryView = !secondaryView;
      try { localStorage.setItem(SECONDARY_KEY, secondaryView ? "1" : "0"); } catch (e) { /* storage unavailable */ }
      syncSecondaryButton();
      secBtn.blur();
      render();
    });
    syncSecondaryButton();

    [["btn-toggle-rings", RINGS_KEY, function () { return ringsOn; }, function (v) { ringsOn = v; }],
     ["btn-toggle-windows", WINDOWS_KEY, function () { return windowsOn; }, function (v) { windowsOn = v; }]].forEach(function (t) {
      const b = document.getElementById(t[0]);
      b.addEventListener("click", function () {
        t[3](!t[2]());
        b.setAttribute("aria-checked", String(t[2]()));
        b.blur();
        try { localStorage.setItem(t[1], t[2]() ? "1" : "0"); } catch (e) { /* storage unavailable */ }
        render();
      });
      b.setAttribute("aria-checked", String(t[2]()));
    });

    // The Today panel's head is its drop-down: a tap on the date folds the rest away or opens it
    // again, and the panel remembers which.
    (function () {
      const fold = document.getElementById("tp-fold"), body = document.getElementById("tp-body");
      if (!fold || !body) return;
      function set(open) {
        fold.setAttribute("aria-expanded", String(open));
        body.hidden = !open;
      }
      try { set(localStorage.getItem(PANEL_OPEN_KEY) !== "0"); } catch (e) { set(true); }
      fold.addEventListener("click", function () {
        const open = fold.getAttribute("aria-expanded") !== "true";
        set(open);
        fold.blur();
        try { localStorage.setItem(PANEL_OPEN_KEY, open ? "1" : "0"); } catch (e) { /* storage unavailable */ }
      });
    })();

    if (E.MuhurtaFinder) {
      E.MuhurtaFinder.init({
        getSettings: function () { return settings; },
        getData: function () { return data; },
        getOpts: yogaOpts,
        goTo: function (date) { setManualTime(date); },
      });
    }

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
  // They live in edit mode (wireEditMode): Previous / Next day, Now, the date
  // field, and dragging the day hand. Live is the default. Moving off it
  // holds the clock at that moment (it does not drift on) until Now is pressed.

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
  // The local calendar day (in the clock's zone) an instant falls on.
  function dayNumber(ms) { return E.Zone.dayNumber(ms); }

  // Whole days the date on show is from the real today (calendar dates in the clock's zone).
  function shownDayOffset() {
    return dayNumber(getNow().getTime()) - dayNumber(Date.now());
  }

  // The shown clock time, `days` calendar days from the real today (local time).
  function sameTimeOnDay(days) {
    const shown = getNow().getTime();
    const timeOfDay = (((shown + E.Zone.offsetMs(shown)) % DAY_MS) + DAY_MS) % DAY_MS;
    return new Date(E.Zone.fromWall((dayNumber(Date.now()) + days) * DAY_MS + timeOfDay));
  }

  // Goes to the day `days` from today,
  // at the clock time on show. Today while live stays live.
  function goToDay(days) {
    if (days === 0 && isLive()) return;
    setManualTime(sameTimeOnDay(days));
  }

  // Goes to sunrise on the day `days` from today (local): ghaṭī 0, pala 0.
  function goToSunrise(days) {
    const noon = new Date(E.Zone.fromWall((dayNumber(Date.now()) + days) * DAY_MS + 12 * 3600000));
    const sunrise = E.Sunrise.sunriseAtOrBefore(settings.location, noon, settings.sunriseEdge);
    if (sunrise instanceof Date && !isNaN(sunrise.getTime())) setManualTime(new Date(sunrise.getTime() + 1500)); // a moment past it, so rounding cannot land before sunrise
    else goToDay(days);
  }

  // Goes to a "YYYY-MM-DD" date (local), at that day's sunrise.
  function goToDateString(value) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!m) return;
    const picked = Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY_MS;
    goToSunrise(picked - dayNumber(Date.now()));
  }

  let locationUi = null;
  let syncDayControls = function () { /* set by wireDayControls */ };

  function wireDayControls() {
    syncDayControls = function () {
      if (!cachedSnapshot) return;
      if (locationUi) locationUi.update();
      document.body.classList.toggle("off-live", !isLive());
      syncEditBar();
    };
  }

  // "YYYY-MM-DD" and "10 Nov 2026" for the local calendar date `days` from the date on show.
  function shownDate(days) {
    const d = new Date((dayNumber(getNow().getTime()) + (days || 0)) * DAY_MS);
    return {
      iso: d.toISOString().slice(0, 10),
      label: d.toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" }),
      short: d.toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "short" }),
    };
  }

  // How far the clock on show is from the real now, for the Today panel's badge:
  // "Tomorrow", "Yesterday", "+5 days", "−3 months"; on today itself, "+2 h 10 m".
  // Empty while live.
  function offsetLabel() {
    if (isLive()) return "";
    const days = shownDayOffset();
    const sign = function (n) { return n < 0 ? "\u2212" : "+"; };
    if (days === 1) return "Tomorrow";
    if (days === -1) return "Yesterday";
    const n = Math.abs(days);
    if (days) {
      if (n < 100) return sign(days) + n + " days";
      if (n < 730) return sign(days) + Math.round(n / 30.44) + " months";
      return sign(days) + Math.round(n / 365.25) + " years";
    }
    const mins = Math.round((getNow().getTime() - Date.now()) / 60000);
    if (!mins) return "Held";
    const m = Math.abs(mins), h = Math.floor(m / 60);
    return sign(mins) + ((h ? h + " h " : "") + (m % 60 || !h ? (m % 60) + " m" : "")).trim();
  }

  // ---- Edit mode -------------------------------------------------------------
  // The pencil button in the top row. While on: the day strip under the buttons
  // (#edit-bar: Now, a week back / the month / a week on, the calendar; then
  // Previous day, the week's seven days with today dotted and the day on show
  // filled, Next day), and the day hand can be dragged round to any time; past
  // sunrise it carries on into the next day. Off live time the dial gets an
  // amber halo and the Today panel says how far the clock is from now.
  let editMode = false;
  let lastEditKey = null;
  const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  function syncEditBar() {
    if (!editMode) return;
    const live = isLive();
    const today = dayNumber(Date.now()), shown = dayNumber(getNow().getTime());
    const key = live + "|" + today + "|" + shown;
    if (key === lastEditKey) return;
    lastEditKey = key;
    const nowBtn = document.getElementById("edit-now");
    nowBtn.classList.toggle("is-live", live);
    nowBtn.setAttribute("aria-pressed", String(live));
    document.getElementById("edit-now-text").textContent = live ? "Live" : "Now";
    nowBtn.title = live ? "Showing live time" : "Back to live time";
    // The week (Sunday first) the day on show falls in. Day 0 of the count was a Thursday.
    const start = shown - ((shown % 7 + 7 + 4) % 7);
    const days = document.getElementById("edit-days");
    days.textContent = "";
    for (let i = 0; i < 7; i++) {
      const dn = start + i, d = new Date(dn * DAY_MS);
      const b = document.createElement("button");
      b.type = "button";
      b.className = "es-day" + (dn === today ? " is-today" : "") + (dn === shown ? " is-shown" : "");
      b.dataset.offset = String(dn - today);
      const label = d.toLocaleDateString("en-GB", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" });
      b.setAttribute("aria-label", label + (dn === today ? ", today" : ""));
      if (dn === shown) b.setAttribute("aria-current", "date");
      b.title = label + (dn === today ? " (today)" : "");
      const wd = document.createElement("span"); wd.className = "es-wd"; wd.textContent = WEEKDAY[i];
      const num = document.createElement("span"); num.className = "es-dn"; num.textContent = String(d.getUTCDate());
      b.appendChild(wd); b.appendChild(num);
      days.appendChild(b);
    }
    const first = new Date(start * DAY_MS), last = new Date((start + 6) * DAY_MS);
    function mon(d, long) { return d.toLocaleDateString("en-GB", { timeZone: "UTC", month: long ? "long" : "short" }); }
    document.getElementById("edit-month").textContent =
      first.getUTCMonth() === last.getUTCMonth() ? mon(first, true) + " " + first.getUTCFullYear()
      : first.getUTCFullYear() === last.getUTCFullYear() ? mon(first) + " \u2013 " + mon(last) + " " + last.getUTCFullYear()
      : mon(first) + " " + first.getUTCFullYear() + " \u2013 " + mon(last) + " " + last.getUTCFullYear();
  }

  function wireEditMode() {
    const body = document.body, toggle = document.getElementById("edit-toggle"), svg = document.getElementById("dial");
    const dateBtn = document.getElementById("edit-date");
    function setEdit(on) {
      editMode = on;
      body.classList.toggle("edit-mode", on);
      toggle.classList.toggle("on", on);
      toggle.setAttribute("aria-pressed", String(on));
      lastEditKey = null;
      syncEditBar();
    }
    toggle.addEventListener("click", function () { setEdit(!editMode); });
    function step(days) { goToSunrise(shownDayOffset() + days); }
    document.getElementById("btn-prev-day").addEventListener("click", function () { step(-1); });
    document.getElementById("btn-next-day").addEventListener("click", function () { step(1); });
    document.getElementById("edit-prev-week").addEventListener("click", function () { step(-7); });
    document.getElementById("edit-next-week").addEventListener("click", function () { step(7); });
    document.getElementById("edit-now").addEventListener("click", function () { if (!isLive()) goLive(); });
    dateBtn.addEventListener("click", function () {
      E.DatePicker.open({ anchor: dateBtn, value: shownDate(0).iso, title: "Go to a date", onPick: goToDateString });
    });
    // The week's days: a tap goes to that day's sunrise (a tap on the day on show
    // stays put); a sideways swipe moves a week.
    const daysEl = document.getElementById("edit-days");
    let swipe = null, swiped = false;
    daysEl.addEventListener("pointerdown", function (e) { swipe = { x: e.clientX, y: e.clientY }; swiped = false; });
    daysEl.addEventListener("pointerup", function (e) {
      if (!swipe) return;
      const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
      swipe = null;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) { swiped = true; step(dx < 0 ? 7 : -7); }
    });
    daysEl.addEventListener("pointercancel", function () { swipe = null; });
    daysEl.addEventListener("click", function (e) {
      if (swiped) { swiped = false; return; }
      const b = e.target.closest(".es-day");
      if (!b || b.classList.contains("is-shown")) return;
      goToSunrise(Number(b.dataset.offset));
    });

    // Dragging the day hand. A press within a few degrees of the hand (outside
    // the centre readout) takes hold of it; each move turns the clock by the
    // angle moved (360 deg = 60 ghaṭīs = 24 h), so it runs on smoothly across
    // sunrise into the next or previous day. Elsewhere a tap still shows the
    // segment's tooltip.
    const GRAB_DEG = 14, MIN_R = 0.13, MAX_R = 0.5;
    function polar(e) {
      const r = svg.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      return { a: (Math.atan2(x, -y) * 180 / Math.PI + 360) % 360, d: Math.hypot(x, y) };
    }
    function nearHand(e) {
      if (!editMode || body.classList.contains("fullview") || !cachedSnapshot) return false;
      const p = polar(e);
      const hand = E.Ghati.current(getNow(), cachedSnapshot.anchors).angleDeg;
      return p.d >= MIN_R && p.d <= MAX_R && Math.abs(((p.a - hand + 540) % 360) - 180) <= GRAB_DEG;
    }
    let drag = null, justDragged = false;
    svg.addEventListener("pointerdown", function (e) {
      if (e.button || !nearHand(e)) return;
      e.preventDefault();
      drag = { id: e.pointerId, a: polar(e).a, t: getNow().getTime() };
      try { svg.setPointerCapture(e.pointerId); } catch (err) { /* not capturable */ }
      svg.classList.add("hand-dragging");
      setManualTime(new Date(drag.t));
    }, true);
    svg.addEventListener("pointermove", function (e) {
      if (!drag) { svg.classList.toggle("hand-grab", nearHand(e)); return; }
      const p = polar(e);
      if (p.d < 0.03) return; // too near the centre for a steady angle
      const delta = ((p.a - drag.a + 540) % 360) - 180;
      drag.a = p.a;
      drag.t += delta / 360 * DAY_MS;
      setManualTime(new Date(Math.round(drag.t)));
    });
    function endDrag() {
      if (!drag) return;
      drag = null;
      justDragged = true;
      setTimeout(function () { justDragged = false; }, 0);
      svg.classList.remove("hand-dragging");
    }
    ["pointerup", "pointercancel", "lostpointercapture"].forEach(function (t) { svg.addEventListener(t, endDrag); });
    // The click that ends a drag is not a tap on a segment.
    svg.addEventListener("click", function (e) { if (justDragged) { e.stopPropagation(); justDragged = false; } }, true);
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

    // Sunrise definition: the user's own choice, unless the chosen method fixes it (Tamil
    // vakya: disc centre), in which case that is shown ticked and greyed out, with a note.
    let sunriseChoice = "disc-centre";
    function syncSunriseRadios() {
      const method = (document.querySelector('input[name="calcMethod"]:checked') || {}).value || "drik";
      const fixed = E.Sidereal.FIXED_SUNRISE_EDGE[method];
      Array.from(document.getElementsByName("sunriseEdge")).forEach(function (radio) {
        radio.disabled = !!fixed;
        radio.checked = radio.value === (fixed || sunriseChoice);
      });
      document.getElementById("sunrise-edge-fixed").style.display = fixed ? "" : "none";
    }
    Array.from(document.getElementsByName("sunriseEdge")).forEach(function (radio) {
      radio.addEventListener("change", function () { if (radio.checked && !radio.disabled) sunriseChoice = radio.value; });
    });
    Array.from(document.getElementsByName("calcMethod")).forEach(function (radio) {
      radio.addEventListener("change", syncSunriseRadios);
    });

    // Fills the form from `from` (the saved settings, or the defaults for
    // Reset to defaults); nothing is committed until Save. The location is not
    // part of this form: it is changed from the place name at the top of the clock screen.
    function populateForm(from) {
      ayanamsaSelect.value = from.ayanamsa;
      document.getElementById("set-script").value = from.script || "iast";
      Array.from(document.getElementsByName("calcMethod")).forEach(function (radio) {
        radio.checked = radio.value === from.method;
      });
      sunriseChoice = from.sunriseEdgeChoice || from.sunriseEdge;
      syncSunriseRadios();
      workingRingOrder = from.ringOrder.slice();
      workingHiddenRings = from.hiddenRings.slice();
      workingHiddenMarkers = from.hiddenMarkers.slice();
      document.getElementById("set-yoga-asal-vakya").checked = !!(from.yogaSets && from.yogaSets.asalVakya);
      document.getElementById("set-yoga-panchaka").checked = !!(from.yogaSets && from.yogaSets.panchaka);
      const janmaSel = document.getElementById("set-janma-nak");
      if (janmaSel.options.length === 1 && data) data.nakshatra.names.forEach(function (name, i) { janmaSel.add(new Option(name, String(i))); });
      janmaSel.value = from.janma && from.janma.nakshatra != null ? String(from.janma.nakshatra) : "";
      document.getElementById("set-janma-pada").value = String((from.janma && from.janma.pada) || 1);
      document.getElementById("set-yoga-regional").checked = from.regionalLimits !== false;
      document.getElementById("set-yoga-descriptive").checked = !!from.descriptiveTips;
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
      const method = (document.querySelector('input[name="calcMethod"]:checked') || {}).value || "drik";

      settings = {
        location: settings.location,
        ayanamsa: ayanamsaSelect.value,
        method: method,
        sunriseEdge: E.Sidereal.sunriseEdgeFor(method, sunriseChoice),
        sunriseEdgeChoice: sunriseChoice,
        ringOrder: workingRingOrder.slice(),
        hiddenRings: workingHiddenRings.slice(),
        hiddenMarkers: workingHiddenMarkers.slice(),
        yogaSets: { asalVakya: document.getElementById("set-yoga-asal-vakya").checked, panchaka: document.getElementById("set-yoga-panchaka").checked },
        janma: {
          nakshatra: document.getElementById("set-janma-nak").value === "" ? null : +document.getElementById("set-janma-nak").value,
          pada: +document.getElementById("set-janma-pada").value || 1,
        },
        regionalLimits: document.getElementById("set-yoga-regional").checked,
        descriptiveTips: document.getElementById("set-yoga-descriptive").checked,
        script: document.getElementById("set-script").value,
        layerOrder: settings.layerOrder.slice(),
      };
      E.Settings.save(settings);
      E.Script.set(settings.script);
      lastSwitchLabel = null;
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

  // The location drop-down and its Change location dialog (location-ui.js).
  function wireLocation() {
    locationUi = E.LocationUI.init({
      getSettings: function () { return settings; },
      // Applies a place at once: the clock is recomputed for it and it is remembered.
      setLocation: function (loc) {
        settings = Object.assign({}, settings, {
          location: Object.assign({}, settings.location, { latitude: loc.latitude, longitude: loc.longitude, elevation: loc.elevation, timezone: E.Zone.normalize(loc.timezone) }),
        });
        E.Zone.set(settings.location.timezone);
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

  // "How to read the clock": the ? button beside Find muhurta, and a one-line pointer
  // to it in the Today panel until it has been opened once.
  function wireHelp() {
    const dlg = document.getElementById("help-dialog"), btn = document.getElementById("btn-help"), hint = document.getElementById("tp-hint");
    const KEY = "vedicWallClock.helpSeen";
    let seen = false;
    try { seen = localStorage.getItem(KEY) === "1"; } catch (e) { /* storage unavailable */ }
    hint.hidden = seen;
    let opener = btn;
    function open(from) {
      opener = from;
      dlg.classList.remove("hidden");
      dlg.querySelector(".ld-card").focus();
      hint.hidden = true;
      try { localStorage.setItem(KEY, "1"); } catch (e) { /* storage unavailable */ }
    }
    function close() {
      dlg.classList.add("hidden");
      (opener && document.contains(opener) && !opener.hidden ? opener : btn).focus();
    }
    btn.addEventListener("click", function () { open(btn); });
    hint.addEventListener("click", function () { open(hint); });
    document.getElementById("help-close").addEventListener("click", close);
    dlg.addEventListener("click", function (e) { if (e.target === dlg) close(); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !dlg.classList.contains("hidden")) close();
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
    E.Dial.setLabelTransform(N);
    // The clock is redrawn for its size on screen whenever that changes (render).
    if (window.ResizeObserver) new ResizeObserver(function () { scaleDirty = true; }).observe(svg);
    else window.addEventListener("resize", function () { scaleDirty = true; });

    wireInput(svg);
    startControlSync();
    wireDayControls();
    wireSettingsPanel();
    wireLocation();
    wireEditMode();
    wireFullView();
    wireHelp();
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
