// Shared helper for tithi (12 deg steps) and karana (6 deg steps): both are just
// the Moon-Sun elongation ("moon phase" in astronomy-engine's terms) divided into
// equal angular steps. Ayanamsa-independent: the ayanamsa offset cancels out of
// a Moon-minus-Sun difference, so this never touches the ayanamsa setting.
(function (global) {
  "use strict";

  const VedicEngine = global.VedicEngine = global.VedicEngine || {};
  const Astronomy = global.Astronomy;
  if (!Astronomy) {
    throw new Error("elongation.js must be loaded after js/vendor/astronomy.browser.js");
  }

  // Returns { index, startTime, endTime, progress } where index = floor(elongation / stepDeg),
  // in [0, 360/stepDeg), startTime/endTime bracket the current step, and progress in [0,1).
  function currentStep(date, stepDeg, method) {
    if (VedicEngine.Sidereal.usesFormula(method)) return currentStepFromFormula(date, stepDeg, method);
    const stepsPerCircle = 360 / stepDeg;
    const elong = Astronomy.MoonPhase(date);
    const index = Math.floor(elong / stepDeg);
    const startDeg = index * stepDeg;
    const endDeg = ((index + 1) % stepsPerCircle) * stepDeg;

    const endResult = Astronomy.SearchMoonPhase(endDeg, date, 2);
    const startSearchFrom = new Date(date.getTime() + 1000);
    const startResult = Astronomy.SearchMoonPhase(startDeg, startSearchFrom, -2);

    if (!endResult || !startResult) {
      throw new Error("SearchMoonPhase failed to bracket the current elongation step; widen the search window.");
    }

    const startTime = startResult.date;
    const endTime = endResult.date;
    const totalMs = endTime.getTime() - startTime.getTime();
    const progress = totalMs > 0 ? (date.getTime() - startTime.getTime()) / totalMs : 0;

    return { index, startTime, endTime, progress };
  }

  // Same result as above, for methods that define their own Sun and Moon positions
  // (no library search available): find where the formula crosses each boundary.
  function currentStepFromFormula(date, stepDeg, method) {
    const Util = VedicEngine.Util, Sidereal = VedicEngine.Sidereal;
    const stepsPerCircle = 360 / stepDeg;
    const angle = function (d) { return Sidereal.elongation(d, method); };
    const index = Math.floor(angle(date) / stepDeg);
    const startDeg = index * stepDeg;
    const endDeg = ((index + 1) % stepsPerCircle) * stepDeg;
    const endTime = Util.findAngleCrossing(angle, date, endDeg, { direction: 1, stepMinutes: 20, maxDays: 2 });
    const startTime = Util.findAngleCrossing(angle, new Date(date.getTime() + 1000), startDeg, { direction: -1, stepMinutes: 20, maxDays: 2 });
    if (!endTime || !startTime) {
      throw new Error("Failed to bracket the current elongation step within the search window.");
    }
    const totalMs = endTime.getTime() - startTime.getTime();
    const progress = totalMs > 0 ? (date.getTime() - startTime.getTime()) / totalMs : 0;
    return { index, startTime, endTime, progress };
  }

  VedicEngine.Elongation = { currentStep };
})(typeof window !== "undefined" ? window : globalThis);
