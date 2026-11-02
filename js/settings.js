// User-facing settings (location, ayanamsa, sunrise definition, ring order,
// hidden rings and marker lines, ring layer order),
// persisted to localStorage. Separate from the debug time override (?t=/
// ?debug=1 in app.js), which is a dev tool, not a kiosk-facing setting.
(function (global) {
  "use strict";

  const VedicEngine = global.VedicEngine = global.VedicEngine || {};
  const STORAGE_KEY = "vedicWallClock.settings.v1";

  function defaults() {
    const base = VedicEngine.Panchanga.DEFAULT_SETTINGS;
    return {
      location: Object.assign({}, base.location),
      ayanamsa: base.ayanamsa,
      sunriseEdge: base.sunriseEdge,
      ringOrder: VedicEngine.RingAdapter.RING_ORDER.slice(),
      // Keys of rings (switchable ones from RING_ORDER, or the always-on
      // ones in RingAdapter.FIXED_RING_TITLES) and marker lines
      // (RingAdapter.MARKER_TITLES) the user has chosen to hide.
      hiddenRings: [],
      hiddenMarkers: [],
      // Physical order of the ring layers, outside in (Dial.LAYER_KEYS).
      layerOrder: VedicEngine.Dial.LAYER_KEYS.slice(),
    };
  }

  // Keeps only keys that exist in `known` (an object or array of keys).
  function sanitizeKeys(keys, known) {
    const knownKeys = Array.isArray(known) ? known : Object.keys(known);
    return (Array.isArray(keys) ? keys : []).filter(function (k, i, arr) { return knownKeys.indexOf(k) !== -1 && arr.indexOf(k) === i; });
  }

  // Keeps only known ring keys (drops stale/corrupt entries, e.g. the old
  // "rahuYamaGulika" ring, now its own Good/Bad Times rings) and inserts any
  // ring the saved list is missing at its default position (so a newly
  // added ring - like Tithi/Nakṣatra joining the cycle - doesn't silently
  // vanish, or land at the very end, just because it predates a user's
  // saved order).
  function sanitizeRingOrder(order) {
    const known = VedicEngine.RingAdapter.RING_ORDER;
    const cleaned = (Array.isArray(order) ? order : []).filter(function (k) { return known.indexOf(k) !== -1; });
    const deduped = cleaned.filter(function (k, i) { return cleaned.indexOf(k) === i; });
    known.forEach(function (k, i) {
      if (deduped.indexOf(k) === -1) deduped.splice(Math.min(i, deduped.length), 0, k);
    });
    return deduped;
  }

  function load() {
    const d = defaults();
    let saved = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) saved = JSON.parse(raw);
    } catch (e) {
      console.warn("Settings: failed to read localStorage, using defaults.", e);
    }
    if (!saved) return d;
    return {
      location: Object.assign({}, d.location, saved.location),
      ayanamsa: VedicEngine.Ayanamsa.registry[saved.ayanamsa] ? saved.ayanamsa : d.ayanamsa,
      sunriseEdge: saved.sunriseEdge === "disc-centre" ? "disc-centre" : "upper-limb",
      ringOrder: sanitizeRingOrder(saved.ringOrder),
      // Only the switchable rings can be hidden; the always-on Good / Bad
      // Times and Day / Night rings and the layer order are not settings any
      // more, so anything an earlier version saved for them is dropped.
      hiddenRings: sanitizeKeys(saved.hiddenRings, VedicEngine.RingAdapter.RING_ORDER),
      hiddenMarkers: sanitizeKeys(saved.hiddenMarkers, VedicEngine.RingAdapter.MARKER_TITLES),
      layerOrder: d.layerOrder,
    };
  }

  function save(settings) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
      console.warn("Settings: failed to write localStorage.", e);
    }
  }

  VedicEngine.Settings = { defaults, load, save, sanitizeRingOrder, STORAGE_KEY };
})(typeof window !== "undefined" ? window : globalThis);
