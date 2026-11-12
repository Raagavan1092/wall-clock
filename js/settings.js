// User-facing settings (location, calculation method, ayanamsa, sunrise definition, ring order,
// hidden rings and marker lines, ring layer order),
// persisted to localStorage. Separate from the debug time override (?t=/
// ?debug=1 in app.js), which is a dev tool, not a kiosk-facing setting.
(function (global) {
  "use strict";

  const VedicEngine = global.VedicEngine = global.VedicEngine || {};
  const STORAGE_KEY = "vedicWallClock.settings.v1";
  // The location "Reset" returns to. Built in: Śṛṅgeri; the user can replace it
  // (Settings > Location > Set as default). Applies at once, not on Save.
  const DEFAULT_LOCATION_KEY = "vedicWallClock.defaultLocation.v1";
  const BUILT_IN_DEFAULT_NAME = "Śṛṅgeri";

  // { name, latitude, longitude, elevation } - the user's default location, or the built-in one.
  function defaultLocation() {
    const base = VedicEngine.Panchanga.DEFAULT_SETTINGS.location;
    const builtIn = Object.assign({}, base, { name: BUILT_IN_DEFAULT_NAME });
    try {
      const raw = localStorage.getItem(DEFAULT_LOCATION_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d && isFinite(d.latitude) && Math.abs(d.latitude) <= 90 && isFinite(d.longitude) && Math.abs(d.longitude) <= 180 &&
            isFinite(d.elevation) && d.elevation >= 0) {
          return { name: String(d.name || "").slice(0, 80) || "your default", latitude: +d.latitude, longitude: +d.longitude, elevation: +d.elevation };
        }
      }
    } catch (e) {
      console.warn("Settings: failed to read the default location.", e);
    }
    return builtIn;
  }

  // True on a first visit: nothing saved yet, so the user must say where they are
  // before the clock can be used (their first location then becomes the default).
  // False if browser storage is unavailable, so the app still works with the built-in location.
  function needsLocation() {
    try {
      return localStorage.getItem(STORAGE_KEY) === null && localStorage.getItem(DEFAULT_LOCATION_KEY) === null;
    } catch (e) {
      return false;
    }
  }

  function setDefaultLocation(loc) {
    try {
      localStorage.setItem(DEFAULT_LOCATION_KEY, JSON.stringify({ name: loc.name, latitude: loc.latitude, longitude: loc.longitude, elevation: loc.elevation }));
      return true;
    } catch (e) {
      console.warn("Settings: failed to write the default location.", e);
      return false;
    }
  }

  function defaults() {
    const base = VedicEngine.Panchanga.DEFAULT_SETTINGS;
    return {
      location: (function () { const d = defaultLocation(); return { latitude: d.latitude, longitude: d.longitude, elevation: d.elevation }; })(),
      ayanamsa: base.ayanamsa,
      method: base.method,
      sunriseEdge: base.sunriseEdge,
      ringOrder: VedicEngine.RingAdapter.RING_ORDER.slice(),
      // Keys of rings (switchable ones from RING_ORDER, or the always-on
      // ones in RingAdapter.FIXED_RING_TITLES) and marker lines
      // (RingAdapter.MARKER_TITLES) the user has chosen to hide.
      hiddenRings: [],
      hiddenMarkers: [],
      // Optional local-practice yoga sets (Settings > Yogas). asalVakya: the
      // Amṛta / Siddha / Maraṇa Yogam weekday x nakṣatra table. Off by default.
      yogaSets: { asalVakya: false },
      // Apply the text's regional limits (a rule the text confines to some
      // lands is shown only for places there). On by default.
      regionalLimits: true,
      // Descriptive mode: a yoga's tooltip gives its description, cause,
      // commentators' views, verse and the reasons it is relaxed. Off (the
      // default): just its name and, for a relaxed bad yoga, when.
      descriptiveTips: false,
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
      method: VedicEngine.Sidereal.METHODS.indexOf(saved.method) !== -1 ? saved.method : d.method,
      sunriseEdge: saved.sunriseEdge === "disc-centre" ? "disc-centre" : "upper-limb",
      ringOrder: sanitizeRingOrder(saved.ringOrder),
      // Only the switchable rings can be hidden; the always-on Good / Bad
      // Times and Day / Night rings and the layer order are not settings any
      // more, so anything an earlier version saved for them is dropped.
      hiddenRings: sanitizeKeys(saved.hiddenRings, VedicEngine.RingAdapter.RING_ORDER),
      hiddenMarkers: sanitizeKeys(saved.hiddenMarkers, VedicEngine.RingAdapter.MARKER_TITLES),
      yogaSets: { asalVakya: !!(saved.yogaSets && saved.yogaSets.asalVakya) },
      regionalLimits: saved.regionalLimits !== false,
      descriptiveTips: saved.descriptiveTips === true,
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

  VedicEngine.Settings = { defaults, load, save, sanitizeRingOrder, defaultLocation, setDefaultLocation, needsLocation, STORAGE_KEY, DEFAULT_LOCATION_KEY };
})(typeof window !== "undefined" ? window : globalThis);
