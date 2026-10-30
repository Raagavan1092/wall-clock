// Tithi: Moon-Sun elongation divided into 30 steps of 12 degrees each.
// Tithi 1-15 = Shukla paksha (waxing; 15 = Purnima), 16-30 = Krishna paksha
// (waning; 30 = Amavasya). Names/numbering convention is standard and not
// flagged as contested.
(function (global) {
  "use strict";

  const VedicEngine = global.VedicEngine = global.VedicEngine || {};
  const Elongation = VedicEngine.Elongation;

  function current(date) {
    const step = Elongation.currentStep(date, 12);
    const tithiNumber = step.index + 1; // 1..30
    const paksha = tithiNumber <= 15 ? "shukla" : "krishna";
    // Index within the paksha, 1..15 (15 = Purnima or Amavasya).
    const pakshaIndex = tithiNumber <= 15 ? tithiNumber : tithiNumber - 15;
    return {
      number: tithiNumber,
      paksha,
      pakshaIndex,
      startTime: step.startTime,
      endTime: step.endTime,
      progress: step.progress,
    };
  }

  VedicEngine.Tithi = { current };
})(typeof window !== "undefined" ? window : globalThis);
