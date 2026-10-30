// Generic "divide day-span and night-span into N equal parts" helper, shared by
// every ring in class (2): muhurta (N=15), prahara/yama (N=4), kala (N=5),
// Rahu/Yama/Gulika (N=8), hora (N=12). Which names/planets/weekday-rules map
// onto which index is a data/orchestration concern (panchanga-data.json +
// panchanga.js), kept out of this file so the division math stays a single,
// auditable implementation instead of five near-duplicates.
(function (global) {
  "use strict";

  const VedicEngine = global.VedicEngine = global.VedicEngine || {};

  function divide(startTime, endTime, n) {
    const totalMs = endTime.getTime() - startTime.getTime();
    const partMs = totalMs / n;
    const intervals = [];
    for (let i = 0; i < n; i++) {
      intervals.push({
        index: i,
        startTime: new Date(startTime.getTime() + i * partMs),
        endTime: new Date(startTime.getTime() + (i + 1) * partMs),
      });
    }
    return intervals;
  }

  // sunrise/sunset/nextSunrise are the three Date anchors every scaled ring needs:
  // day runs sunrise->sunset, night runs sunset->nextSunrise (per spec).
  function dayAndNight(sunrise, sunset, nextSunrise, n) {
    return {
      day: divide(sunrise, sunset, n),
      night: divide(sunset, nextSunrise, n),
    };
  }

  VedicEngine.ScaledIntervals = { divide, dayAndNight };
})(typeof window !== "undefined" ? window : globalThis);
