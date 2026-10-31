// Pure SVG geometry: draws the fixed (never-recomputed) ghati scale once, and
// exposes update functions for the rings, the live hand, and the centre text.
// Never touches VedicEngine or panchanga-data.json directly - it only
// consumes plain numbers/strings and the segment lists from ring-adapter.js.
(function (global) {
  "use strict";

  const VedicEngine = global.VedicEngine = global.VedicEngine || {};
  const SVG_NS = "http://www.w3.org/2000/svg";

  // CX/CY leave a permanent margin outside outerRingOuter (480) for the
  // yoga-alert ring (yogaRingInner..yogaRingOuter below) - it's the ONE ring
  // allowed to appear/disappear on its own (see renderYogaAlertRing), so the
  // canvas has to have room for it whether or not it's drawn on a given day.
  const CX = 540, CY = 540;
  // Concentric bands, outside in: the yoga-alert ring (only actually drawn
  // on days one of the five nitya yogas is active - see renderYogaAlertRing),
  // then the switchable ring (muhurta/prahara/kala/hora/rahuYamaGulika -
  // whichever is toggled; see ring-adapter.js RING_ORDER), then two
  // dedicated thin rings that always show tithi and nakshatra (these two are
  // pulled out of the toggle because they're the ones people check
  // constantly), then the fixed ghati/pala scale, then the innermost
  // always-on day/night ring, then the centre readout.
  const R = {
    yogaRingOuter: 520,
    yogaRingInner: 484, // 4-unit gap from outerRingOuter, matching the gaps between other bands
    outerRingOuter: 480,
    outerRingInner: 436,
    nakshatraRingOuter: 432,
    nakshatraRingInner: 400, // 32 thick (was 20) - thicker band for bigger labels
    tithiRingOuter: 396,
    tithiRingInner: 364, // 32 thick (was 20)
    ghatiMajorTickOuter: 356,
    ghatiMajorTickInner: 322,
    ghatiMinorTickOuter: 356,
    ghatiMinorTickInner: 340,
    ghatiNumeral: 300,
    dayNightRingOuter: 284,
    dayNightRingInner: 258, // thin band - a little thicker than the tithi ring
    hand: 270, // same length as palaHand, per the project owner
    palaHand: 270, // shorter/faster second spoke, reaches into the day/night ring
    hub: 14,
    centrePlate: 186,
    centreTextY: -24, // centre readout sits a little above centre, leaving room for...
    centreButtonsY: 112, // ...the Switch time / Switch display buttons below it
  };

  function polarToXY(angleDeg, radius) {
    const rad = (angleDeg * Math.PI) / 180;
    return { x: CX + radius * Math.sin(rad), y: CY - radius * Math.cos(rad) };
  }

  function angularSpanClockwise(startAngle, endAngle) {
    return ((endAngle - startAngle) % 360 + 360) % 360;
  }

  // Hour:minute, IST, for hover-tooltip time ranges on every ring segment.
  function fmtHM(date) {
    return date.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: false, hour: "2-digit", minute: "2-digit" });
  }

  // Every ring segment's tooltip shows BOTH the Vedic reading (ghati/pala,
  // from ring-adapter.js's startGhatiPala/endGhatiPala - dial.js itself
  // never touches VedicEngine, see file header) and the plain clock time,
  // per the project owner: "ghati pala and hour and minutes", everywhere.
  // Two short lines - "GG:PP – GG:PP" then "HH:MM – HH:MM" - under the topic.
  function timeRangeTooltip(seg) {
    return seg.startGhatiPala + " – " + seg.endGhatiPala + "\n" + fmtHM(seg.startTime) + " – " + fmtHM(seg.endTime);
  }

  // Custom dark-mode tooltip. SVG's native <title> tooltip is OS-rendered
  // (usually a light box) and can't be styled via CSS, which is why this
  // exists instead - a plain HTML div positioned near the pointer, styled in
  // style.css. (A light-mode variant is a later concern, per the brief.)
  let tooltipEl = null;
  function getTooltip() {
    if (!tooltipEl) {
      tooltipEl = document.createElement("div");
      tooltipEl.className = "dial-tooltip";
      tooltipEl.style.display = "none";
      document.body.appendChild(tooltipEl);
    }
    return tooltipEl;
  }

  function attachTooltip(path, text) {
    path.addEventListener("mouseenter", function () {
      const tip = getTooltip();
      tip.textContent = "";
      text.split("\n").forEach(function (line, i) {
        if (i > 0) tip.appendChild(document.createElement("br"));
        tip.appendChild(document.createTextNode(line));
      });
      tip.style.display = "block";
    });
    path.addEventListener("mousemove", function (e) {
      const tip = getTooltip();
      tip.style.left = e.clientX + 16 + "px";
      tip.style.top = e.clientY + 16 + "px";
    });
    path.addEventListener("mouseleave", function () {
      getTooltip().style.display = "none";
    });
  }

  function el(tag, attrs) {
    const node = document.createElementNS(SVG_NS, tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    return node;
  }

  function annularSectorPath(rInner, rOuter, startAngle, span) {
    const endAngle = startAngle + span;
    const outerStart = polarToXY(startAngle, rOuter);
    const outerEnd = polarToXY(endAngle, rOuter);
    const innerStart = polarToXY(startAngle, rInner);
    const innerEnd = polarToXY(endAngle, rInner);
    const largeArc = span > 180 ? 1 : 0;
    return [
      "M", outerStart.x, outerStart.y,
      "A", rOuter, rOuter, 0, largeArc, 1, outerEnd.x, outerEnd.y,
      "L", innerEnd.x, innerEnd.y,
      "A", rInner, rInner, 0, largeArc, 0, innerStart.x, innerStart.y,
      "Z",
    ].join(" ");
  }

  // Plain horizontal text at the given radial position. Deliberately never
  // rotated to follow the radius/tangent - at high segment counts (30 for
  // muhurta) tangent-following text reads worse, not better, at this size,
  // and horizontal text is never upside-down regardless of which side of the
  // dial it falls on.
  function radialLabel(text, angleDeg, radius, fontSize, extraClass) {
    const p = polarToXY(angleDeg, radius);
    const t = el("text", {
      x: p.x, y: p.y,
      "text-anchor": "middle",
      "dominant-baseline": "middle",
      "font-size": fontSize,
      class: "dial-label" + (extraClass ? " " + extraClass : ""),
    });
    t.textContent = text;
    return t;
  }

  let curvedLabelCounter = 0;

  // Text that flows along the circle's curve, centred on `midAngle`. Used for
  // the tithi/nakshatra rings, where each segment is usually a single,
  // nearly-full-circle arc with plenty of room to actually follow the curve
  // (unlike the 30-segment muhurta ring, where curved text at that size reads
  // worse, not better - see radialLabel above).
  //
  // Readability rule: in the top half of the dial, a plain clockwise arc
  // already reads left-to-right with glyphs upright. In the bottom half, the
  // SAME clockwise direction would leave the path "under" the text the wrong
  // way and render upside-down, so the path is drawn in the opposite
  // (decreasing-angle) direction instead - which, for an arc in the bottom
  // half, still sweeps left-to-right on screen, with glyphs upright.
  function curvedLabel(parent, text, midAngle, span, radius, fontSize, extraClass) {
    const halfSpan = Math.min(span, 170) / 2;
    const bottomHalf = midAngle > 90 && midAngle < 270;
    const a1 = bottomHalf ? midAngle + halfSpan : midAngle - halfSpan;
    const a2 = bottomHalf ? midAngle - halfSpan : midAngle + halfSpan;
    // Glyphs extend away from the path in the direction opposite the local
    // "inward" normal, so nudge the path radius a touch so the visual centre
    // of the text (not just its baseline) lands on `radius`.
    const pathRadius = radius + (bottomHalf ? fontSize * 0.35 : -fontSize * 0.35);
    const p1 = polarToXY(a1, pathRadius);
    const p2 = polarToXY(a2, pathRadius);
    const sweep = bottomHalf ? 0 : 1;
    const id = "curve-label-" + (curvedLabelCounter++);
    const path = el("path", {
      id: id,
      d: `M ${p1.x} ${p1.y} A ${pathRadius} ${pathRadius} 0 0 ${sweep} ${p2.x} ${p2.y}`,
      class: "label-path",
    });
    parent.appendChild(path);

    const t = el("text", { class: "dial-label curved-label" + (extraClass ? " " + extraClass : ""), "font-size": fontSize });
    const textPath = el("textPath", { startOffset: "50%", "text-anchor": "middle" });
    textPath.setAttribute("href", "#" + id);
    textPath.textContent = text;
    t.appendChild(textPath);
    parent.appendChild(t);
  }

  // Static framing only - the ticks/numerals between these circles live in
  // their own group (see renderGhatiScale/renderHourScale), since "Switch
  // time" swaps that scale between 60 ghatis and 24 hours.
  function buildScaleFrame(root) {
    const g = el("g", { class: "scale-frame" });

    // Boundary circles, purely decorative framing between bands.
    [R.outerRingOuter, R.outerRingInner, R.nakshatraRingInner, R.tithiRingInner].forEach(function (r) {
      g.appendChild(el("circle", { cx: CX, cy: CY, r: r, class: "ring-boundary" }));
    });
    g.appendChild(el("circle", { cx: CX, cy: CY, r: R.ghatiMinorTickOuter, class: "ghati-scale-boundary" }));
    [R.dayNightRingOuter, R.dayNightRingInner].forEach(function (r) {
      g.appendChild(el("circle", { cx: CX, cy: CY, r: r, class: "ring-boundary" }));
    });
    root.appendChild(g);
  }

  function tick(g, angle, rInner, rOuter, cls) {
    const p1 = polarToXY(angle, rInner);
    const p2 = polarToXY(angle, rOuter);
    g.appendChild(el("line", { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, class: cls }));
  }

  // The ghati scale never depends on the day (ghati 0 is sunrise, always at
  // the top), so it's identical every time it's drawn.
  function renderGhatiScale(g) {
    while (g.firstChild) g.removeChild(g.firstChild);

    // Minor ticks: 5 sub-lines between each pair of major (per-ghati) ticks,
    // i.e. 6 divisions per ghati (360 positions total; skip the 1-in-6 that
    // coincides with a major tick, which is drawn separately below).
    const MINOR_DIVISIONS_PER_GHATI = 6;
    const minorCount = 60 * MINOR_DIVISIONS_PER_GHATI;
    for (let q = 0; q < minorCount; q++) {
      const angle = q * (360 / minorCount);
      if (q % MINOR_DIVISIONS_PER_GHATI === 0) continue; // major tick will be drawn on top
      tick(g, angle, R.ghatiMinorTickInner, R.ghatiMinorTickOuter, "tick-minor");
    }

    // Major ticks + numerals: all 60 ghatis numbered (multiples of 5 a bit
    // larger/bolder, keeping them as landmarks, but nothing skipped).
    for (let gh = 0; gh < 60; gh++) {
      const angle = gh * 6;
      tick(g, angle, R.ghatiMajorTickInner, R.ghatiMajorTickOuter, "tick-major");
      const isLandmark = gh % 5 === 0;
      g.appendChild(radialLabel(String(gh), angle, R.ghatiNumeral, isLandmark ? 16 : 12, isLandmark ? "ghati-numeral" : "ghati-numeral-minor"));
    }
  }

  // Hour-mode scale: 24 divisions, one per IST clock hour, each at its true
  // angle on the same sunrise-anchored scale (15 deg per hour, since 60
  // ghati = 24h), so no ring has to move. The top is sunrise, labelled with
  // its time; hour numerals too close to it to fit are left as ticks only.
  // `scale` is ring-adapter.js's buildHourScale output.
  function renderHourScale(g, scale) {
    while (g.firstChild) g.removeChild(g.firstChild);
    const QUARTERS = 4; // minor ticks every 15 minutes
    scale.hours.forEach(function (h) {
      for (let q = 1; q < QUARTERS; q++) {
        tick(g, h.angle + q * (15 / QUARTERS), R.ghatiMinorTickInner, R.ghatiMinorTickOuter, "tick-minor");
      }
      tick(g, h.angle, R.ghatiMajorTickInner, R.ghatiMajorTickOuter, "tick-major");
      const distFromTop = Math.min(h.angle, 360 - h.angle);
      if (distFromTop < 7) return;
      const isLandmark = h.hour % 6 === 0;
      g.appendChild(radialLabel(String(h.hour), h.angle, R.ghatiNumeral, isLandmark ? 20 : 17, isLandmark ? "ghati-numeral" : "hour-numeral"));
    });
    // The first whole hour after sunrise is less than 15 deg clockwise of the
    // top, so the quarter ticks before it still need drawing.
    const first = scale.hours[0];
    for (let a = first.angle - 15 / QUARTERS; a > 0.5; a -= 15 / QUARTERS) {
      tick(g, a, R.ghatiMinorTickInner, R.ghatiMinorTickOuter, "tick-minor");
    }
    tick(g, 0, R.ghatiMajorTickInner - 6, R.ghatiMajorTickOuter, "tick-sunrise");
    g.appendChild(radialLabel(scale.sunriseLabel, 0, R.ghatiNumeral, 18, "sunrise-numeral"));
  }

  function buildStaticStructure(svg) {
    svg.innerHTML = "";
    svg.setAttribute("viewBox", "0 0 " + (CX * 2) + " " + (CY * 2));

    // Created up front like every other ring group, but renderYogaAlertRing
    // leaves it empty (no boundary, no segments) on a day none of the five
    // nitya yogas apply - see that function and the R.yogaRing* comment above.
    const yogaRingGroup = el("g", { class: "yoga-ring" });
    svg.appendChild(yogaRingGroup);

    const outerRingGroup = el("g", { class: "outer-ring" });
    svg.appendChild(outerRingGroup);
    const nakshatraRingGroup = el("g", { class: "nakshatra-ring" });
    svg.appendChild(nakshatraRingGroup);
    const tithiRingGroup = el("g", { class: "tithi-ring" });
    svg.appendChild(tithiRingGroup);

    buildScaleFrame(svg);
    const scaleGroup = el("g", { class: "time-scale" });
    svg.appendChild(scaleGroup);
    renderGhatiScale(scaleGroup);

    const dayNightRingGroup = el("g", { class: "daynight-ring" });
    svg.appendChild(dayNightRingGroup);

    // Centre plate is drawn BEFORE the hands now, so the hands are visibly
    // whole spokes reaching all the way from the true centre point outward
    // (like a real clock's hands, which always cross the dial face) rather
    // than appearing to start at the plate's edge. Centre TEXT is drawn
    // after the hands so the readout stays legible on top; the hands still
    // show through the gaps between letters/lines, which is normal for an
    // analog clock face. Pala hand (the faster, shorter spoke - one sweep
    // per ghati, like a minute hand) is drawn first so the primary ghati
    // hand sits on top where they cross.
    svg.appendChild(el("circle", { cx: CX, cy: CY, r: R.centrePlate, class: "centre-plate" }));

    const handGroup = el("g", { class: "hand" });
    const palaHandGroup = el("g", { class: "pala-hand" });
    palaHandGroup.appendChild(el("line", { x1: CX, y1: CY, x2: CX, y2: CY - R.palaHand, class: "pala-hand-line" }));
    handGroup.appendChild(el("line", { x1: CX, y1: CY, x2: CX, y2: CY - R.hand, class: "hand-line" }));
    handGroup.appendChild(el("circle", { cx: CX, cy: CY, r: R.hub, class: "hand-hub" }));
    svg.appendChild(palaHandGroup);
    svg.appendChild(handGroup);

    const centreGroup = el("g", { class: "centre-text" });
    svg.appendChild(centreGroup);

    // Two buttons side by side under the centre readout, drawn in the SVG
    // so they scale with the dial on every screen size.
    const BTN_W = 112, BTN_H = 36, BTN_GAP = 10, BTN_Y = CY + R.centreButtonsY;
    const timeButton = centreButton("Switch time", CX - BTN_GAP / 2 - BTN_W, BTN_Y, BTN_W, BTN_H);
    const displayButton = centreButton("Switch display", CX + BTN_GAP / 2, BTN_Y, BTN_W, BTN_H);
    svg.appendChild(timeButton);
    svg.appendChild(displayButton);

    return { yogaRingGroup, outerRingGroup, nakshatraRingGroup, tithiRingGroup, scaleGroup, dayNightRingGroup, centreGroup, handGroup, palaHandGroup, timeButton, displayButton };
  }

  function centreButton(label, x, y, w, h) {
    const g = el("g", { class: "centre-button", role: "button", tabindex: "0", "aria-label": label });
    g.appendChild(el("rect", { x: x, y: y, width: w, height: h, rx: h / 2, class: "centre-button-bg" }));
    const t = el("text", { x: x + w / 2, y: y + h / 2, "text-anchor": "middle", "dominant-baseline": "central", class: "centre-button-label" });
    t.textContent = label;
    g.appendChild(t);
    return g;
  }

  // geom: { rInner, rOuter, fontSize: number | (span)=>number, minSpanForLabel? }
  function renderRing(group, ringDescriptor, geom) {
    while (group.firstChild) group.removeChild(group.firstChild);
    const fontSizeFn = typeof geom.fontSize === "function" ? geom.fontSize : function () { return geom.fontSize; };
    const minSpanForLabel = geom.minSpanForLabel != null ? geom.minSpanForLabel : 6;

    ringDescriptor.segments.forEach(function (seg) {
      const span = angularSpanClockwise(seg.startAngle, seg.endAngle);
      if (span <= 0.0001) return;
      const path = el("path", {
        d: annularSectorPath(geom.rInner, geom.rOuter, seg.startAngle, span),
        class: "ring-segment" + (seg.contested ? " contested" : "") + (seg.isNext ? " next-segment" : "") + (seg.goodBad ? " " + seg.goodBad : "") + (seg.text ? "" : " neutral"),
      });
      if (seg.text) {
        attachTooltip(path, seg.text + "\n" + timeRangeTooltip(seg) + (seg.extraTooltip ? "\n" + seg.extraTooltip : ""));
      }
      group.appendChild(path);

      if (seg.text && span >= minSpanForLabel) {
        const midAngle = seg.startAngle + span / 2;
        const midRadius = (geom.rInner + geom.rOuter) / 2;
        const fontSize = fontSizeFn(span);
        const labelClass = [seg.contested ? "contested-label" : "", seg.isNext ? "next-label" : "", seg.goodBad ? seg.goodBad + "-label" : ""].filter(Boolean).join(" ") || undefined;
        if (geom.curved) {
          curvedLabel(group, seg.text, midAngle, span, midRadius, fontSize, labelClass);
        } else {
          group.appendChild(radialLabel(seg.text, midAngle, midRadius, fontSize, labelClass));
        }
      }
      if (seg.contested) {
        const midAngle = seg.startAngle + span / 2;
        group.appendChild(radialLabel("⚠", midAngle, geom.rOuter - 12, 15, "contested-marker"));
      }
    });
  }

  // Rings with few, wide segments (Yaama: 8, Kala: 6, Rahu/Yama/Gulika: 9)
  // get curved text, same as tithi/nakshatra - plenty of room per segment,
  // unlike muhurta's 30 segments at 12 deg each or hora's 24, where curved
  // text would read worse, not better (see curvedLabel's own comment).
  const CURVED_OUTER_RINGS = { prahara: true, kala: true, rahuYamaGulika: true };

  function renderOuterRing(group, ringDescriptor) {
    const curved = !!CURVED_OUTER_RINGS[ringDescriptor.ringKey];
    renderRing(group, ringDescriptor, {
      rInner: R.outerRingInner, rOuter: R.outerRingOuter,
      fontSize: curved ? 14 : function (span) { return span >= 15 ? 15 : 11; },
      minSpanForLabel: 6,
      curved: curved,
    });
  }
  function renderNakshatraRing(group, ringDescriptor) {
    renderRing(group, ringDescriptor, { rInner: R.nakshatraRingInner, rOuter: R.nakshatraRingOuter, fontSize: 24, minSpanForLabel: 0, curved: true });
  }
  function renderTithiRing(group, ringDescriptor) {
    renderRing(group, ringDescriptor, { rInner: R.tithiRingInner, rOuter: R.tithiRingOuter, fontSize: 24, minSpanForLabel: 0, curved: true });
  }

  // The one ring that appears and disappears on its own: ring-adapter.js's
  // buildYogaAlerts always returns a full day's worth of segments (mostly
  // blank), but this function only actually DRAWS anything - boundary
  // circles included - when at least one of them is active. On a day none
  // of the five nitya yogas apply, the group is just left empty, so that
  // band of the dial reads as plain background, not as an empty ring; see
  // the R.yogaRing*/CX/CY comments above for why the canvas still reserves
  // the space either way (so the rest of the dial never resizes/jumps).
  // Same crowding guard as the old merged ring: a higher minSpanForLabel
  // than the other curved rings, since two or three of the five sources can
  // still change within an hour of each other and label-collide otherwise.
  function renderYogaAlertRing(group, ringDescriptor) {
    const hasActive = ringDescriptor.segments.some(function (seg) { return seg.text; });
    if (!hasActive) {
      while (group.firstChild) group.removeChild(group.firstChild);
      return;
    }
    renderRing(group, ringDescriptor, {
      rInner: R.yogaRingInner, rOuter: R.yogaRingOuter,
      fontSize: 13,
      minSpanForLabel: 11,
      curved: true,
    });
    group.appendChild(el("circle", { cx: CX, cy: CY, r: R.yogaRingOuter, class: "ring-boundary" }));
    group.appendChild(el("circle", { cx: CX, cy: CY, r: R.yogaRingInner, class: "ring-boundary" }));
  }

  // Innermost ring: just day/night, two segments, always the same two
  // colours (day/night classes in style.css) regardless of position.
  function renderDayNightRing(group, ringDescriptor) {
    while (group.firstChild) group.removeChild(group.firstChild);
    ringDescriptor.segments.forEach(function (seg) {
      const span = angularSpanClockwise(seg.startAngle, seg.endAngle);
      if (span <= 0.0001) return;
      const path = el("path", {
        d: annularSectorPath(R.dayNightRingInner, R.dayNightRingOuter, seg.startAngle, span),
        class: "daynight-segment " + (seg.isDay ? "daynight-day" : "daynight-night"),
      });
      attachTooltip(path, seg.text + "\n" + timeRangeTooltip(seg));
      group.appendChild(path);
    });
  }

  function setHand(handGroup, angleDeg) {
    handGroup.setAttribute("transform", `rotate(${angleDeg} ${CX} ${CY})`);
  }

  function setPalaHand(palaHandGroup, angleDeg) {
    palaHandGroup.setAttribute("transform", `rotate(${angleDeg} ${CX} ${CY})`);
  }

  // `line.subText`, when present, is appended as a smaller trailing tspan on
  // the same line (e.g. the big "Ghati 21 · Pala 55" line gets a smaller
  // " · Vipala 12" tacked on, the way a stopwatch shows milliseconds
  // smaller than the seconds).
  function setCentreText(centreGroup, lines) {
    while (centreGroup.firstChild) centreGroup.removeChild(centreGroup.firstChild);
    const lineHeight = 34;
    const startY = CY + R.centreTextY - ((lines.length - 1) * lineHeight) / 2;
    lines.forEach(function (line, i) {
      const t = el("text", {
        x: CX, y: startY + i * lineHeight,
        "text-anchor": "middle",
        "dominant-baseline": "middle",
        class: "centre-line" + (line.emphasis ? " centre-line-" + line.emphasis : ""),
      });
      t.appendChild(document.createTextNode(line.text));
      if (line.subText) {
        t.appendChild(el("tspan", { class: "centre-line-sub" })).textContent = line.subText;
      }
      centreGroup.appendChild(t);
    });
  }

  VedicEngine.Dial = {
    R, CX, CY,
    buildStaticStructure,
    renderOuterRing,
    renderNakshatraRing,
    renderTithiRing,
    renderYogaAlertRing,
    renderDayNightRing,
    renderGhatiScale,
    renderHourScale,
    setHand,
    setPalaHand,
    setCentreText,
    polarToXY,
  };
})(typeof window !== "undefined" ? window : globalThis);
