// Karana: half-tithi, 60 per lunar (synodic) month, in a fixed pattern:
//   half-tithi #1        -> Kimstughna (fixed)
//   half-tithi #2..#57   -> 7 movable karanas repeating 8 times
//   half-tithi #58,59,60 -> Shakuni, Chatushpada, Naga (fixed)
// This ordering is the standard one found across panchanga references; exact
// spelling/order of the movable cycle and the three trailing fixed karanas is
// the kind of detail that varies slightly by text, so names themselves live in
// panchanga-data.json (with a contested note) rather than here. The engine only
// returns a stable key: 'kimstughna' | 'shakuni' | 'chatushpada' | 'naga' |
// 'movable:0'..'movable:6'.
(function (global) {
  "use strict";

  const VedicEngine = global.VedicEngine = global.VedicEngine || {};
  const Elongation = VedicEngine.Elongation;

  const TRAILING_FIXED = ["shakuni", "chatushpada", "naga"];

  function keyForHalfTithiIndex(halfTithiIndex) {
    if (halfTithiIndex === 0) return "kimstughna";
    if (halfTithiIndex >= 57) return TRAILING_FIXED[halfTithiIndex - 57];
    return "movable:" + ((halfTithiIndex - 1) % 7);
  }

  function current(date) {
    const step = Elongation.currentStep(date, 6);
    return {
      number: step.index + 1, // 1..60
      key: keyForHalfTithiIndex(step.index),
      startTime: step.startTime,
      endTime: step.endTime,
      progress: step.progress,
    };
  }

  VedicEngine.Karana = { current, keyForHalfTithiIndex };
})(typeof window !== "undefined" ? window : globalThis);
