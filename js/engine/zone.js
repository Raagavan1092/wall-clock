// The clock's time zone: the one every time on the clock is shown in and every "day"
// (the date, the weekday, the day buttons, alarms' clock times) is counted in.
//
// It is the zone of the place the clock is set to (Settings > Location): India's places are
// Asia/Kolkata (IST, no DST), a city abroad has its own, with daylight saving where it has
// one. The device's own time zone is never used, so the clock reads the same on any phone.
//
// Functions take an optional `tz` (an IANA id); without it they use the clock's zone, set with
// Zone.set(). Times are milliseconds since the epoch (or Dates). "Wall ms" below means a local
// date-and-time written as if it were UTC (the usual trick for doing calendar sums).
(function (global) {
  "use strict";

  const VedicEngine = global.VedicEngine = global.VedicEngine || {};
  const DEFAULT = "Asia/Kolkata";
  const MIN = 60000, DAY = 86400000;
  // Names the data may use that an older browser's time zone list does not know yet.
  const ALIASES = { "Europe/Kyiv": "Europe/Kiev", "America/Nuuk": "America/Godthab", "Asia/Kolkata": "Asia/Calcutta", "Asia/Yangon": "Asia/Rangoon",
    "Asia/Ho_Chi_Minh": "Asia/Saigon", "Pacific/Kanton": "Pacific/Enderbury", "America/Ciudad_Juarez": "America/Ojinaga", "Asia/Qostanay": "Asia/Almaty",
    "Atlantic/Faroe": "Atlantic/Faeroe", "Asia/Kathmandu": "Asia/Katmandu" };

  let current = DEFAULT;
  const formatters = {};      // tz -> Intl.DateTimeFormat for the offset sums
  const resolved = {};        // tz -> the id the browser accepts (or "")

  // The id as this browser knows it, or "" if it does not know the zone at all.
  function known(tz) {
    if (tz in resolved) return resolved[tz];
    let ok = "";
    [tz, ALIASES[tz]].forEach(function (id) {
      if (ok || !id) return;
      try { new Intl.DateTimeFormat("en-US", { timeZone: id }); ok = id; } catch (e) { /* unknown here */ }
    });
    resolved[tz] = ok;
    return ok;
  }
  // A usable zone id for whatever was saved or passed in: itself, or Asia/Kolkata.
  function normalize(tz) {
    return typeof tz === "string" && tz && (tz === DEFAULT || known(tz)) ? tz : DEFAULT;
  }
  function set(tz) { current = normalize(tz); return current; }
  function id() { return current; }
  // The id to hand to Intl (toLocaleTimeString etc.): the same zone, spelt as this browser knows it.
  function intl(tz) { tz = tz || current; return tz === DEFAULT ? DEFAULT : (known(tz) || DEFAULT); }

  // Offset from UTC, in ms, at instant `t` (positive east of Greenwich). Whole minutes.
  // A transition only ever falls on a quarter hour, so one answer per quarter hour is exact.
  const cache = new Map();
  function offsetMs(t, tz) {
    tz = tz || current;
    if (tz === DEFAULT) return 330 * MIN;
    const key = tz + "|" + Math.floor(t / (15 * MIN));
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    const at = Math.floor(t / (15 * MIN)) * 15 * MIN;
    const f = formatters[tz] || (formatters[tz] = new Intl.DateTimeFormat("en-US", {
      timeZone: intl(tz), hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric",
    }));
    const p = {};
    f.formatToParts(new Date(at)).forEach(function (x) { p[x.type] = +x.value; });
    const off = Math.round((Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second) - at) / MIN) * MIN;
    if (cache.size > 4000) cache.clear();
    cache.set(key, off);
    return off;
  }

  // The local calendar day `t` falls on, as a whole number (days since 1970-01-01 of the local date).
  function dayNumber(t, tz) { return Math.floor((t + offsetMs(t, tz)) / DAY); }
  // The instant a local date-and-time (written as wall ms) happens.
  function fromWall(wall, tz) {
    const first = wall - offsetMs(wall, tz);
    return wall - offsetMs(first, tz);
  }
  // Local midnight at the start of local day number `n`.
  function dayStart(n, tz) { return fromWall(n * DAY, tz); }
  // Local date and time of `t`: { year, month (0-11), day, hour, minute, second, weekday (0=Sunday) }.
  function parts(t, tz) {
    const d = new Date(t + offsetMs(t, tz));
    return { year: d.getUTCFullYear(), month: d.getUTCMonth(), day: d.getUTCDate(), hour: d.getUTCHours(), minute: d.getUTCMinutes(), second: d.getUTCSeconds(), weekday: d.getUTCDay() };
  }
  // Weekday (0=Sunday..6=Saturday) of `t` by the local calendar.
  function weekday(t, tz) { return new Date(t + offsetMs(t, tz)).getUTCDay(); }
  // "YYYY-MM-DD" of the local date of `t`, and the day number of such a string.
  function dateString(t, tz) { return new Date(t + offsetMs(t, tz)).toISOString().slice(0, 10); }
  function today(tz) { return dateString(Date.now(), tz); }
  function dayOfString(s) { return Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / DAY; }
  // Local midnight starting the date "YYYY-MM-DD".
  function startOfDate(s, tz) { return dayStart(dayOfString(s), tz); }
  // Local clock time on the local date of `t`... as an instant: hour:minute on date string `s`.
  function onDate(s, hour, minute, tz) { return fromWall(dayOfString(s) * DAY + (hour * 60 + minute) * MIN, tz); }

  function offsetText(t, tz) {
    const m = offsetMs(t, tz) / MIN, a = Math.abs(m);
    return (m < 0 ? "-" : "+") + String(Math.floor(a / 60)).padStart(2, "0") + ":" + String(a % 60).padStart(2, "0");
  }
  // The city part of the zone id: "Asia/Dubai" -> "Dubai".
  function city(tz) { return (tz || current).split("/").pop().replace(/_/g, " "); }
  // A short name for the zone as it is at `t`: IST for India, EST/PST... where the browser has one, else UTC+4.
  function abbr(t, tz) {
    tz = tz || current;
    if (tz === DEFAULT || tz === "Asia/Calcutta") return "IST";
    try {
      const n = new Intl.DateTimeFormat("en-US", { timeZone: intl(tz), timeZoneName: "short" }).formatToParts(new Date(t)).filter(function (x) { return x.type === "timeZoneName"; })[0];
      if (n && /^[A-Z]{2,5}$/.test(n.value) && n.value !== "GMT" && n.value !== "UTC") return n.value;
    } catch (e) { /* fall through */ }
    const m = offsetMs(t, tz) / MIN;
    return "UTC" + (m === 0 ? "" : (m < 0 ? "-" : "+") + Math.floor(Math.abs(m) / 60) + (Math.abs(m) % 60 ? ":" + String(Math.abs(m) % 60).padStart(2, "0") : ""));
  }
  // What the location dialog shows: "IST · +05:30", "EST · -05:00", "Dubai · +04:00".
  function describe(t, tz) {
    tz = tz || current;
    const a = abbr(t, tz);
    return (/^[A-Z]{2,5}$/.test(a) && a.indexOf("UTC") !== 0 ? a : city(tz)) + " · " + offsetText(t, tz);
  }

  VedicEngine.Zone = {
    DEFAULT: DEFAULT, set: set, id: id, intl: intl, normalize: normalize, offsetMs: offsetMs, dayNumber: dayNumber, dayStart: dayStart, fromWall: fromWall,
    parts: parts, weekday: weekday, dateString: dateString, today: today, dayOfString: dayOfString, startOfDate: startOfDate, onDate: onDate,
    offsetText: offsetText, abbr: abbr, city: city, describe: describe,
  };
})(typeof window !== "undefined" ? window : globalThis);
