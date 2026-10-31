// User-facing settings (location, ayanamsa, sunrise definition, ring order,
// hidden rings and marker lines),
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
    };
  }

  // Keeps only keys that exist in `known` (an object or array of keys).
  function sanitizeKeys(keys, known) {
    const knownKeys = Array.isArray(known) ? known : Object.keys(known);
    return (Array.isArray(keys) ? keys : []).filter(function (k, i, arr) { return knownKeys.indexOf(k) !== -1 && arr.indexOf(k) === i; });
  }

  // Keeps only known ring keys (drops stale/corrupt entries) and appends any
  // ring type the saved list is missing (so a future new ring type doesn't
  // silently vanish just because it predates a user's saved order).
  function sanitizeRingOrder(order) {
    const known = VedicEngine.RingAdapter.RING_ORDER;
    const cleaned = (Array.isArray(order) ? order : []).filter(function (k) { return known.indexOf(k) !== -1; });
    const deduped = cleaned.filter(function (k, i) { return cleaned.indexOf(k) === i; });
    known.forEach(function (k) { if (deduped.indexOf(k) === -1) deduped.push(k); });
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
      hiddenRings: sanitizeKeys(saved.hiddenRings, VedicEngine.RingAdapter.RING_ORDER.concat(Object.keys(VedicEngine.RingAdapter.FIXED_RING_TITLES))),
      hiddenMarkers: sanitizeKeys(saved.hiddenMarkers, VedicEngine.RingAdapter.MARKER_TITLES),
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
