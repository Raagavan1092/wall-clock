// Pure SVG geometry: draws the fixed (never-recomputed) ghati scale once, and
// exposes update functions for the rings, the live hand, and the centre text.
// Never touches VedicEngine or panchanga-data.json directly - it only
// consumes plain numbers/strings and the segment lists from ring-adapter.js.
(function (global) {
  "use strict";

  const VedicEngine = global.VedicEngine = global.VedicEngine || {};
  const SVG_NS = "http://www.w3.org/2000/svg";

  // The rings run out to radius 610, almost the dial's edge (615). The
  // marker-line labels (Āvartana, Niśītha, ...) sit INSIDE the clock instead,
  // each written along its own line's angle, ending where the line starts.
  const CX = 615, CY = 615;
  // Concentric bands, outside in: two ring LAYERS - by default the
  // switchable ring (whichever of ring-adapter.js RING_ORDER is toggled,
  // outermost so its many labels get the most room), then the Good / Bad
  // Times ring, reorderable in Settings (setLayerOrder) - then the fixed
  // ghaṭī/pala scale, then the innermost day/night ring, then the centre
  // readout. The layers' radii (outerRing*/goodBadRing*) are filled in by
  // setLayerOrder below.
  // Everything inside the ring layers (the ghaṭī scale, day/night ring,
  // hands, marker labels and the centre readout) is drawn at the radii below
  // times K, so the clock face is larger than it was: the Good / Bad Times
  // ring gave up some width to make room (LAYER_THICKNESS), and the centre
  // text grew with the face.
  const K = 1.13;
  const R = {
    ghatiMajorTickOuter: 356 * K,
    ghatiMajorTickInner: 322 * K,
    ghatiMinorTickOuter: 356 * K,
    ghatiMinorTickInner: 340 * K,
    ghatiNumeral: 300 * K,
    dayNightRingOuter: 284 * K,
    dayNightRingInner: 258 * K, // thin band - a little thicker than the tithi ring
    hand: 270 * K, // same length as palaHand, per the project owner
    palaHand: 270 * K, // shorter/faster second spoke, reaches into the day/night ring
    markerLineOuter: 611, // Āvartana/Niśītha lines run out through every ring to its outer edge (610)...
    markerLabel: 254 * K, // ...and their name sits just inside where the line starts (the day/night ring's inner edge)...
    markerLabelInner: 188 * K, // ...running inward along the same angle, no further than the centre plate
    hub: 16,
    centrePlate: 186 * K,
    centreTextY: 0, // the centre readout is centred; the buttons now live below the clock (app.html)
  };

  function polarToXY(angleDeg, radius) {
    const rad = (angleDeg * Math.PI) / 180;
    return { x: CX + radius * Math.sin(rad), y: CY - radius * Math.cos(rad) };
  }

  function angularSpanClockwise(startAngle, endAngle) {
    return ((endAngle - startAngle) % 360 + 360) % 360;
  }

  // A segment's angular span. One that lasts the whole sunrise-to-sunrise
  // day (e.g. a nakṣatra that holds all day) starts and ends at the same
  // angle, which the plain angle difference would read as ~0, not 360.
  function segmentSpan(seg) {
    const span = angularSpanClockwise(seg.startAngle, seg.endAngle);
    const longerThanHalfDay = seg.startTime && seg.endTime && seg.endTime - seg.startTime > 12 * 3600 * 1000;
    return span < 1 && longerThanHalfDay ? 360 : span;
  }

  // Hour:minute, IST, for hover-tooltip time ranges on every ring segment.
  function fmtHM(date) {
    return date.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: false, hour: "2-digit", minute: "2-digit" });
  }

  // Every ring segment's tooltip shows BOTH the Vedic reading (ghati/pala,
  // from ring-adapter.js's startGhatiPala/endGhatiPala - dial.js itself
  // never touches VedicEngine, see file header) and the plain clock time,
  // per the project owner: "ghati pala and hour and minutes", everywhere.
  // Two short lines under the topic, each naming its convention:
  // "GG:PP – GG:PP (Gh:Pal)" then "HH:MM – HH:MM (Hr:Min)".
  const GP_TAG = " (Gh:Pal)", HM_TAG = " (Hr:Min)";
  function timeRangeTooltip(seg) {
    return seg.startGhatiPala + " – " + seg.endGhatiPala + GP_TAG + "\n" + fmtHM(seg.startTime) + (seg.startDateNote || "") + " – " + fmtHM(seg.endTime) + (seg.endDateNote || "") + HM_TAG;
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
    if (span >= 359.99) {
      // A full ring: an arc can't start and end at the same point, so go
      // round as two half-circle arcs, outer clockwise then inner back.
      const o1 = polarToXY(startAngle, rOuter), o2 = polarToXY(startAngle + 180, rOuter);
      const i1 = polarToXY(startAngle, rInner), i2 = polarToXY(startAngle + 180, rInner);
      return [
        "M", o1.x, o1.y, "A", rOuter, rOuter, 0, 1, 1, o2.x, o2.y, "A", rOuter, rOuter, 0, 1, 1, o1.x, o1.y,
        "M", i1.x, i1.y, "A", rInner, rInner, 0, 1, 0, i2.x, i2.y, "A", rInner, rInner, 0, 1, 0, i1.x, i1.y,
        "Z",
      ].join(" ");
    }
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
  // A "\n" in `text` splits it over two lines, the second a little smaller,
  // centred together on the same point.
  function radialLabel(text, angleDeg, radius, fontSize, extraClass, forceSize) {
    const p = polarToXY(angleDeg, radius);
    const t = el("text", {
      x: p.x, y: p.y,
      "text-anchor": "middle",
      "dominant-baseline": "middle",
      "font-size": fontSize,
      class: "dial-label" + (extraClass ? " " + extraClass : ""),
    });
    // `forceSize` sets the size as an inline style, which (unlike the
    // font-size attribute) wins over .dial-label's CSS font-size.
    if (forceSize) t.style.fontSize = fontSize + "px";
    const lines = text.split("\n");
    if (lines.length === 1) {
      t.textContent = text;
      return t;
    }
    const subSize = forceSize ? fontSize * 0.9 : Math.max(10, Math.round(fontSize * 0.9));
    t.appendChild(el("tspan", { x: p.x, y: p.y - subSize * 0.6 })).textContent = lines[0];
    t.appendChild(el("tspan", { x: p.x, y: p.y + fontSize * 0.6, "font-size": subSize })).textContent = lines[1];
    return t;
  }

  let curvedLabelCounter = 0;
  const AVG_GLYPH_WIDTH = 0.55; // rough average advance per character, in ems
  const MIN_CURVED_FONT = 9;
  const CSS_LABEL_FONT = 15; // .dial-label's font-size in style.css (curvedLabelAtStart's fallback)

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
  // `forcedSize`, when given, is set as an inline style so it overrides the
  // .dial-label CSS font-size (used to shrink a label to fit its segment).
  function curvedLabel(parent, text, midAngle, span, radius, fontSize, extraClass, forcedSize) {
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
    if (forcedSize) t.style.fontSize = forcedSize.toFixed(1) + "px";
    const textPath = el("textPath", { startOffset: "50%", "text-anchor": "middle" });
    textPath.setAttribute("href", "#" + id);
    textPath.textContent = text;
    t.appendChild(textPath);
    parent.appendChild(t);
  }

  // Static framing only - the ticks/numerals between these circles live in
  // their own group (see renderGhatiScale/renderHourScale), since "Switch
  // time" swaps that scale between 60 ghatis and 24 hours.
  // The two reorderable ring layers, outside in by default. The Good / Bad
  // Times ring is the wider one, as it holds two halves (see
  // renderGoodBadRing). Whatever the order, they pack inward from radius
  // 610 with a 4-unit gap and always end at the same inner radius (368), so
  // the ghaṭī scale and everything inside never move. The room freed when
  // the marker labels moved inside the clock went mostly to the Good / Bad
  // Times ring, a little to the switchable one.
  const LAYER_KEYS = ["switchable", "goodBad"];
  const LAYER_THICKNESS = { switchable: 70, goodBad: 120 };
  const LAYER_RADIUS_PREFIX = { switchable: "outerRing", goodBad: "goodBadRing" };
  const LAYERS_OUTER = 610, LAYER_GAP = 4;
  let layerFrame = null;
  setLayerOrder(LAYER_KEYS); // fill in R's layer radii with the default order

  // Assigns each layer its radii for `order` (outside in; any missing or
  // unknown keys fall back to the default order) and redraws the layer
  // boundaries. Callers re-render the rings afterwards.
  function setLayerOrder(order) {
    const valid = (order || []).filter(function (k, i, arr) { return LAYER_KEYS.indexOf(k) !== -1 && arr.indexOf(k) === i; });
    const full = valid.length === LAYER_KEYS.length ? valid : LAYER_KEYS;
    let r = LAYERS_OUTER;
    full.forEach(function (key) {
      const prefix = LAYER_RADIUS_PREFIX[key];
      R[prefix + "Outer"] = r;
      R[prefix + "Inner"] = r - LAYER_THICKNESS[key];
      r = R[prefix + "Inner"] - LAYER_GAP;
    });
    if (layerFrame) {
      clearGroup(layerFrame);
      LAYER_KEYS.forEach(function (key) {
        const prefix = LAYER_RADIUS_PREFIX[key];
        [R[prefix + "Outer"], R[prefix + "Inner"]].forEach(function (radius) {
          layerFrame.appendChild(el("circle", { cx: CX, cy: CY, r: radius, class: "ring-boundary" }));
        });
      });
    }
  }

  function buildScaleFrame(root) {
    const g = el("g", { class: "scale-frame" });

    // Boundary circles, purely decorative framing between bands. The ring
    // layers' own boundaries live in layerFrame (setLayerOrder), since
    // they move when the layers are reordered.
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
      g.appendChild(radialLabel(String(gh), angle, R.ghatiNumeral, isLandmark ? 20 : 15, isLandmark ? "ghati-numeral" : "ghati-numeral-minor", true));
    }
  }

  // Hour-mode scale: 24 divisions, one per IST clock hour, each at its true
  // angle on the same sunrise-anchored scale (15 deg per hour, since 60
  // ghati = 24h), so no ring has to move. The top is sunrise, labelled with
  // its time; hour numerals too close to it to fit are left as ticks only.
  // `scale` is ring-adapter.js's buildHourScale output.
  function renderHourScale(g, scale) {
    while (g.firstChild) g.removeChild(g.firstChild);
    const DIVISIONS = 6; // 5 minor ticks between hours, one every 10 minutes
    scale.hours.forEach(function (h) {
      for (let q = 1; q < DIVISIONS; q++) {
        tick(g, h.angle + q * (15 / DIVISIONS), R.ghatiMinorTickInner, R.ghatiMinorTickOuter, "tick-minor");
      }
      tick(g, h.angle, R.ghatiMajorTickInner, R.ghatiMajorTickOuter, "tick-major");
      const distFromTop = Math.min(h.angle, 360 - h.angle);
      if (distFromTop < 7) return;
      const isLandmark = h.hour % 6 === 0;
      g.appendChild(radialLabel(String(h.hour), h.angle, R.ghatiNumeral, isLandmark ? 24 : 20, isLandmark ? "ghati-numeral" : "hour-numeral", true));
    });
    // The first whole hour after sunrise is less than 15 deg clockwise of the
    // top, so the minor ticks before it still need drawing.
    const first = scale.hours[0];
    for (let a = first.angle - 15 / DIVISIONS; a > 0.5; a -= 15 / DIVISIONS) {
      tick(g, a, R.ghatiMinorTickInner, R.ghatiMinorTickOuter, "tick-minor");
    }
    tick(g, 0, R.ghatiMajorTickInner - 6, R.ghatiMajorTickOuter, "tick-sunrise");
    g.appendChild(radialLabel(scale.sunriseLabel, 0, R.ghatiNumeral, 22, "sunrise-numeral", true));
  }

  function buildStaticStructure(svg) {
    svg.innerHTML = "";
    svg.setAttribute("viewBox", "0 0 " + (CX * 2) + " " + (CY * 2));

    const goodBadRingGroup = el("g", { class: "good-bad-ring" });
    svg.appendChild(goodBadRingGroup);
    const outerRingGroup = el("g", { class: "outer-ring" });
    svg.appendChild(outerRingGroup);

    buildScaleFrame(svg);
    layerFrame = el("g", { class: "layer-frame" });
    svg.appendChild(layerFrame);
    setLayerOrder(LAYER_KEYS);
    const scaleGroup = el("g", { class: "time-scale" });
    svg.appendChild(scaleGroup);
    renderGhatiScale(scaleGroup);

    const dayNightRingGroup = el("g", { class: "daynight-ring" });
    svg.appendChild(dayNightRingGroup);

    // Avartana/Nishitha marker lines, over every ring but under the hands.
    const markerGroup = el("g", { class: "day-markers" });
    svg.appendChild(markerGroup);

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

    return { goodBadRingGroup, outerRingGroup, scaleGroup, dayNightRingGroup, markerGroup, centreGroup, handGroup, palaHandGroup };
  }

  // geom: { rInner, rOuter, fontSize: number | (span)=>number, minSpanForLabel?,
  //   curved?, alternate?, labelAtStart? }. `alternate` colours named
  //   segments by position, red then green then red... ("div-base"/"div-alt"
  //   in style.css), for every ring of plain divisions. `labelAtStart`
  //   (curved rings only) puts each label right after the segment's start
  //   boundary instead of in its middle - see START_LABEL_RINGS in
  //   ring-adapter.js.
  function segmentTooltip(seg) {
    return seg.text + "\n" + timeRangeTooltip(seg) + (seg.extraTooltip ? "\n" + seg.extraTooltip : "");
  }

  // The font size a curved label of `text` needs to fit an arc of `span`
  // degrees at `radius`, with a little breathing room.
  function fittedCurvedFont(text, span, radius) {
    const arcLength = (Math.min(span, 170) * Math.PI / 180) * radius * 0.9;
    return arcLength / (text.length * AVG_GLYPH_WIDTH);
  }

  // The largest font a straight label (one or two lines) can take in a cell
  // of `span` degrees at `radius`, `thickness` units deep.
  const RADIAL_MAX_FONT = 22, MIN_RADIAL_FONT = 8;
  const CURVED_MAX_FONT = 26;
  function fittedRadialFont(lines, span, radius, thickness) {
    const widest = Math.max.apply(null, lines.map(function (l) { return l.length; }));
    const width = (span * Math.PI / 180) * radius * 0.92;
    const byWidth = width / (widest * AVG_GLYPH_WIDTH);
    const byDepth = lines.length > 1 ? (thickness * 0.92) / 2.1 : thickness * 0.5;
    return Math.min(RADIAL_MAX_FONT, byWidth, byDepth);
  }

  // Each segment (its path and its label) goes in its own group tagged with
  // its start/end time, so updateTimeState can highlight the one that is
  // active now and dim the ones already over, every tick, without
  // redrawing the ring.
  function timedGroup(parent, seg) {
    const g = el("g", { class: "timed" });
    g.dataset.start = seg.startTime.getTime();
    g.dataset.end = seg.endTime.getTime();
    parent.appendChild(g);
    return g;
  }

  // Past segments dim, the active one is highlighted (and raised to the top
  // of its ring, so its outline isn't painted over by its neighbours),
  // upcoming ones stay as drawn. Cheap enough to run on every tick: it only
  // touches the DOM when a segment's state actually changes.
  function updateTimeState(groups, now) {
    const t = now.getTime();
    groups.forEach(function (group) {
      group.querySelectorAll(".timed").forEach(function (g) {
        const past = Number(g.dataset.end) <= t;
        const active = !past && Number(g.dataset.start) <= t;
        if (g.classList.contains("is-past") !== past) g.classList.toggle("is-past", past);
        if (g.classList.contains("is-active") !== active) {
          g.classList.toggle("is-active", active);
          if (active) g.parentNode.appendChild(g);
        }
      });
    });
  }

  function renderRing(group, ringDescriptor, geom) {
    while (group.firstChild) group.removeChild(group.firstChild);
    const minSpanForLabel = geom.minSpanForLabel != null ? geom.minSpanForLabel : 6;

    ringDescriptor.segments.forEach(function (seg, i) {
      const span = segmentSpan(seg);
      if (span <= 0.0001) return;
      const alternateClass = geom.alternate && seg.text ? (i % 2 ? " div-alt" : " div-base") : "";
      const path = el("path", {
        d: annularSectorPath(geom.rInner, geom.rOuter, seg.startAngle, span),
        class: "ring-segment" + alternateClass + (seg.contested ? " contested" : "") + (seg.text ? "" : " neutral"),
      });
      const segGroup = timedGroup(group, seg);
      segGroup.appendChild(path);
      if (seg.text) attachTooltip(path, segmentTooltip(seg));

      if (seg.text && span >= minSpanForLabel) {
        const midAngle = seg.startAngle + span / 2;
        const midRadius = (geom.rInner + geom.rOuter) / 2;
        const labelClass = seg.contested ? "contested-label" : undefined;
        const thickness = geom.rOuter - geom.rInner;
        if (geom.curved) {
          // Grow the label to the ring's full width, but shrink it to fit
          // its arc; skip it only if even small text won't fit - the
          // tooltip still has it. The size is applied as an inline style,
          // which wins over .dial-label's CSS font-size. A start-anchored
          // label gives up a little of the arc to its padding from the
          // boundary.
          const usable = geom.labelAtStart ? span - 2 * startPadDeg(midRadius) : span;
          const fitted = usable > 0 ? fittedCurvedFont(seg.text, usable, midRadius) : 0;
          const size = Math.min(Math.min(CURVED_MAX_FONT, thickness * 0.36), fitted);
          if (fitted >= MIN_CURVED_FONT) {
            if (geom.labelAtStart) curvedLabelAtStart(segGroup, seg.text, seg.startAngle, span, midRadius, labelClass, size);
            else curvedLabel(segGroup, seg.text, midAngle, span, midRadius, size, labelClass, size);
          }
        } else {
          // "Tvaṣṭā (Brahma Muhūrta)" is too long for one 12-deg muhūrta
          // cell, so a parenthetical goes on a second line. The label is as
          // large as its cell's width (and the ring's thickness) allow.
          const text = seg.text.replace(" (", "\n(");
          const size = fittedRadialFont(text.split("\n"), span, midRadius, thickness);
          if (size >= MIN_RADIAL_FONT) segGroup.appendChild(radialLabel(text, midAngle, midRadius, size, labelClass, true));
        }
      }
      if (seg.contested) {
        const midAngle = seg.startAngle + span / 2;
        segGroup.appendChild(radialLabel("⚠", midAngle, geom.rOuter - 12, 15, "contested-marker"));
      }
    });
  }

  // Gap between a division's start boundary and its start-anchored label,
  // as an angle at `radius` (a fixed ~8 units of arc).
  function startPadDeg(radius) {
    return (8 / radius) * 180 / Math.PI;
  }

  // Like curvedLabel, but the text starts right after `startAngle` (the
  // division's boundary) and runs clockwise from there, rather than being
  // centred on the segment. Same readability rule: in the bottom half the
  // path runs the other way so glyphs stay upright, and the text is then
  // anchored at the path's END, which is the boundary side.
  function curvedLabelAtStart(parent, text, startAngle, span, radius, extraClass, forcedSize) {
    const pad = startPadDeg(radius);
    const avail = Math.min(span - 2 * pad, 170);
    if (avail <= 0) return;
    const shownFont = forcedSize || CSS_LABEL_FONT;
    const textDeg = Math.min(avail, (text.length * AVG_GLYPH_WIDTH * shownFont / radius) * 180 / Math.PI);
    const from = startAngle + pad, to = from + avail;
    const labelMid = ((from + textDeg / 2) % 360 + 360) % 360;
    const bottomHalf = labelMid > 90 && labelMid < 270;
    const pathRadius = radius + (bottomHalf ? shownFont * 0.35 : -shownFont * 0.35);
    const p1 = polarToXY(bottomHalf ? to : from, pathRadius);
    const p2 = polarToXY(bottomHalf ? from : to, pathRadius);
    const id = "curve-label-" + (curvedLabelCounter++);
    parent.appendChild(el("path", {
      id: id,
      d: `M ${p1.x} ${p1.y} A ${pathRadius} ${pathRadius} 0 0 ${bottomHalf ? 0 : 1} ${p2.x} ${p2.y}`,
      class: "label-path",
    }));
    const t = el("text", { class: "dial-label curved-label" + (extraClass ? " " + extraClass : "") });
    if (forcedSize) t.style.fontSize = forcedSize.toFixed(1) + "px";
    const textPath = el("textPath", { startOffset: bottomHalf ? "100%" : "0%", "text-anchor": bottomHalf ? "end" : "start" });
    textPath.setAttribute("href", "#" + id);
    textPath.textContent = text;
    t.appendChild(textPath);
    parent.appendChild(t);
  }

  // Rings with few, wide segments (Tithi, Nakṣatra, Yāma, Kāla, Yoga,
  // Karaṇa, Lagna) get curved text - plenty of room per segment, unlike
  // muhurta's 30 segments at 12 deg each or hora's 24, where curved text
  // would read worse, not better (see curvedLabel's own comment).
  const CURVED_OUTER_RINGS = { tithi: true, nakshatra: true, prahara: true, kala: true, yoga: true, karana: true, lagna: true };

  // `startLabelRings` is ring-adapter.js's START_LABEL_RINGS (passed in by
  // app.js, since dial.js never reads the adapter directly).
  function renderOuterRing(group, ringDescriptor, startLabelRings) {
    const curved = !!CURVED_OUTER_RINGS[ringDescriptor.ringKey];
    renderRing(group, ringDescriptor, {
      rInner: R.outerRingInner, rOuter: R.outerRingOuter,
      minSpanForLabel: curved ? 0 : 6, // curved labels shrink to fit instead (see renderRing)
      curved: curved,
      alternate: true,
      labelAtStart: curved && !!(startLabelRings && startLabelRings[ringDescriptor.ringKey]),
    });
  }

  // The Good / Bad Times ring (ring-adapter.js buildGoodBadTimes): one
  // ring split down the middle by an axis circle. Good windows grow
  // OUTWARD from the axis, bad ones INWARD (toward the hand), so a clash
  // between a good and a bad window shows up at the same angle on both
  // sides of the line. A window that overlaps no other of its kind stretches
  // across its whole half; windows that overlap share the half, each in its
  // own thin sub-ring ("lane", lane 0 hugging the axis), side by side with
  // its own colour and label. The overlap is judged per cluster of
  // mutually-overlapping windows, so a busy stretch of the day doesn't
  // squeeze the quiet ones.
  // `show` ({good, bad}, both true by default) is the pair of "Show good /
  // bad times" toggles: with only one kind shown it takes the whole ring,
  // the axis goes, and its labels grow with the extra width.
  // A label that can't fit its lane even at the smallest size is left to
  // the tooltip.
  const LANE_GAP = 2;
  const AXIS_GAP = 2;
  const MIN_LANE_FONT = 7;
  const MAX_LANE_FONT = 44;
  // Per window, the number of lanes its cluster of overlapping windows
  // needs (1 for a window on its own). Windows must be sorted by start, as
  // ring-adapter.js's layoutEvents leaves them.
  function clusterLaneCounts(segments) {
    const counts = new Map();
    let cluster = [], clusterEnd = -Infinity, lanes = 0;
    function flush() { cluster.forEach(function (ev) { counts.set(ev, lanes); }); }
    segments.forEach(function (ev) {
      if (ev.startTime.getTime() >= clusterEnd) { flush(); cluster = []; lanes = 0; clusterEnd = -Infinity; }
      cluster.push(ev);
      lanes = Math.max(lanes, ev.lane + 1);
      clusterEnd = Math.max(clusterEnd, ev.endTime.getTime());
    });
    flush();
    return counts;
  }

  function renderGoodBadRing(group, good, bad, show) {
    while (group.firstChild) group.removeChild(group.firstChild);
    const showGood = !show || show.good !== false, showBad = !show || show.bad !== false;
    const rInner = R.goodBadRingInner, rOuter = R.goodBadRingOuter;
    group.appendChild(el("path", { d: annularSectorPath(rInner, rOuter, 0, 360), class: "ring-segment neutral event-ring-bg" }));

    // Each kind has a base circle its lanes grow away from, and a depth.
    const both = showGood && showBad;
    // With both halves on, the axis sits where the room is split in
    // proportion to each side's lane count (more overlapping layers = more
    // ring width), rather than down the middle.
    let axis = (rInner + rOuter) / 2;
    if (both) {
      const gl = Math.max(1, good.laneCount || 1), bl = Math.max(1, bad.laneCount || 1);
      axis = rOuter - (rOuter - rInner) * gl / (gl + bl);
    }
    const goodBase = both ? axis + AXIS_GAP : rInner, goodDepth = rOuter - goodBase;
    const badBase = both ? axis - AXIS_GAP : rOuter, badDepth = badBase - rInner;

    function draw(ev, laneInner, laneOuter) {
      const laneWidth = laneOuter - laneInner;
      const span = segmentSpan(ev);
      if (span <= 0.0001) return;
      const g = timedGroup(group, ev);
      const path = el("path", {
        d: annularSectorPath(laneInner, laneOuter, ev.startAngle, span),
        class: "ring-segment event-segment " + ev.goodBad,
      });
      attachTooltip(path, segmentTooltip(ev));
      g.appendChild(path);
      const midRadius = (laneInner + laneOuter) / 2;
      const size = Math.min(MAX_LANE_FONT, laneWidth * 0.42, fittedCurvedFont(ev.text, span, midRadius));
      if (size < MIN_LANE_FONT) return;
      curvedLabel(g, ev.text, ev.startAngle + span / 2, span, midRadius, size, ev.goodBad + "-label", size);
    }
    // Lane geometry for a window: its cluster's lane count sets the width.
    function laneOf(ev, counts, depth) {
      const n = counts.get(ev) || 1;
      const width = (depth - LANE_GAP * (n - 1)) / n;
      return { width: width, offset: ev.lane * (width + LANE_GAP) };
    }
    if (showGood) {
      const counts = clusterLaneCounts(good.segments);
      good.segments.forEach(function (ev) {
        const l = laneOf(ev, counts, goodDepth);
        draw(ev, goodBase + l.offset, goodBase + l.offset + l.width);
      });
    }
    if (showBad) {
      const counts = clusterLaneCounts(bad.segments);
      bad.segments.forEach(function (ev) {
        const l = laneOf(ev, counts, badDepth);
        draw(ev, badBase - l.offset - l.width, badBase - l.offset);
      });
    }
    if (both) group.appendChild(el("circle", { cx: CX, cy: CY, r: axis, class: "good-bad-axis" }));
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

  // Avartana (midday) and Nishitha (midnight), and the other day markers: a
  // line from the day/night ring out through every ring to the outer ring
  // edge, and the name written inside the clock, ending where the line
  // starts, as its extension inward along the same angle. On the left half
  // of the dial the text is flipped so it still reads left-to-right.
  // `markers` is ring-adapter.js's buildDayMarkers output.
  //
  // Markers can land close together (e.g. moonset next to Āvartana); a run
  // of markers each within MARKER_CLASH_DEG of the previous is fanned out,
  // their labels nudged sideways off their lines in angle order, so they
  // don't overprint.
  const MARKER_CLASH_DEG = 2.5;
  const MARKER_FONT = 15; // .day-marker-label's font-size in style.css
  function renderDayMarkers(group, markers) {
    while (group.firstChild) group.removeChild(group.firstChild);
    const sorted = markers.slice().sort(function (a, b) { return a.angle - b.angle; });
    const clusters = [];
    sorted.forEach(function (m, i) {
      if (i > 0 && m.angle - sorted[i - 1].angle < MARKER_CLASH_DEG) clusters[clusters.length - 1].push(m);
      else clusters.push([m]);
    });
    clusters.forEach(function (cluster) {
      cluster.forEach(function (m, k) {
        const offset = (k - (cluster.length - 1) / 2) * MARKER_FONT * 1.1;
        drawMarker(group, m, offset);
      });
    });
  }

  function drawMarker(group, m, offset) {
    const p1 = polarToXY(m.angle, R.dayNightRingInner);
    const p2 = polarToXY(m.angle, R.markerLineOuter);
    group.appendChild(el("line", { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, class: "day-marker-line" }));
    // Wide invisible twin so the thin line is easy to hover/tap.
    const hit = el("line", { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, class: "day-marker-hit" });
    const tip = (m.tooltipTitle || m.text) + "\n" + m.ghatiPala + GP_TAG + "\n" + fmtHM(m.time) + (m.dateNote || "") + HM_TAG;
    attachTooltip(hit, tip);
    group.appendChild(hit);
    const label = markerLabel(m.text, m.angle, offset);
    group.appendChild(label);
    // Shrink to fit between the line's start and the centre plate.
    const room = R.markerLabel - R.markerLabelInner;
    const length = label.getComputedTextLength ? label.getComputedTextLength() : 0;
    if (length > room) label.style.fontSize = (MARKER_FONT * room / length).toFixed(1) + "px";
  }

  // `offset` moves the label sideways off its line's axis (positive =
  // clockwise), only for markers fanned out by renderDayMarkers.
  function markerLabel(text, angle, offset) {
    const start = polarToXY(angle, R.markerLabel);
    const leftHalf = angle > 180;
    const rotation = leftHalf ? angle + 90 : angle - 90;
    const t = el("text", {
      // In the rotated frame +y is clockwise on the right half but
      // anticlockwise on the left, where the text is flipped.
      x: 0, y: leftHalf ? -offset : offset,
      // Runs inward from `start` either way: on the right half the baseline
      // points outward, so the text is anchored at its end; on the left half
      // it points inward, so it is anchored at its start.
      "text-anchor": leftHalf ? "start" : "end",
      "dominant-baseline": "central",
      transform: `translate(${start.x} ${start.y}) rotate(${rotation})`,
      class: "day-marker-label",
    });
    t.textContent = text;
    return t;
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
  // Line heights by emphasis: the big ghaṭī line, the clock line, then
  // everything else in a tighter rhythm.
  const CENTRE_LINE_HEIGHT = { ghati: 64, "clock-secondary": 46, ring: 38, gap: 18 };
  const CENTRE_LINE_HEIGHT_DEFAULT = 36;
  // Text may reach a little past the plate's edge (into the empty space
  // before the day/night ring) but no further than this radius.
  const CENTRE_REACH = 236;
  function setCentreText(centreGroup, lines) {
    while (centreGroup.firstChild) centreGroup.removeChild(centreGroup.firstChild);
    const heights = lines.map(function (line) { return CENTRE_LINE_HEIGHT[line.emphasis] || CENTRE_LINE_HEIGHT_DEFAULT; });
    const total = heights.reduce(function (a, b) { return a + b; }, 0);
    let y = CY + R.centreTextY - total / 2;
    lines.forEach(function (line, i) {
      const lineY = y + heights[i] / 2;
      y += heights[i];
      if (!line.text) return; // a blank spacer line
      const t = el("text", {
        x: CX, y: lineY,
        "text-anchor": "middle",
        "dominant-baseline": "middle",
        class: "centre-line" + (line.emphasis ? " centre-line-" + line.emphasis : ""),
      });
      t.appendChild(document.createTextNode(line.text));
      let sub = null;
      if (line.subText) {
        sub = t.appendChild(el("tspan", { class: "centre-line-sub" }));
        sub.textContent = line.subText;
      }
      centreGroup.appendChild(t);
      // A line that would run past CENTRE_REACH at its height (chord of
      // the circle, narrower toward the top and bottom) shrinks to fit.
      if (t.getComputedTextLength) {
        const reach = CENTRE_REACH;
        const dy = Math.abs(lineY - CY) + heights[i] / 2;
        const maxWidth = 2 * Math.sqrt(Math.max(0, reach * reach - dy * dy));
        const length = t.getComputedTextLength();
        if (length > maxWidth && length > 0) {
          const f = maxWidth / length;
          t.style.fontSize = (parseFloat(getComputedStyle(t).fontSize) * f).toFixed(1) + "px";
          if (sub) sub.style.fontSize = (parseFloat(getComputedStyle(sub).fontSize) * f).toFixed(1) + "px";
        }
      }
    });
  }

  function clearGroup(group) {
    while (group.firstChild) group.removeChild(group.firstChild);
  }

  VedicEngine.Dial = {
    R, CX, CY,
    LAYER_KEYS,
    clearGroup,
    setLayerOrder,
    buildStaticStructure,
    renderOuterRing,
    renderGoodBadRing,
    updateTimeState,
    renderDayNightRing,
    renderDayMarkers,
    renderGhatiScale,
    renderHourScale,
    setHand,
    setPalaHand,
    setCentreText,
    polarToXY,
  };
})(typeof window !== "undefined" ? window : globalThis);
