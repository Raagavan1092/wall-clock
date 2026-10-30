// Shared math/time helpers for the panchanga engine. Plain global namespace (no bundler),
// loaded via <script> before the other engine files.
(function (global) {
  "use strict";

  const VedicEngine = global.VedicEngine = global.VedicEngine || {};

  // Wrap a degree value into [0, 360).
  function normDeg(x) {
    let r = x % 360;
    if (r < 0) r += 360;
    return r;
  }

  // Wrap a degree value into (-180, 180], useful for "signed distance to target".
  function wrapSigned180(x) {
    let r = normDeg(x + 180) - 180;
    if (r <= -180) r += 360;
    return r;
  }

  const MS_PER_DAY = 86400000;

  function addDays(date, days) {
    return new Date(date.getTime() + days * MS_PER_DAY);
  }

  function diffDays(a, b) {
    return (a.getTime() - b.getTime()) / MS_PER_DAY;
  }

  // Weekday index (0=Sunday..6=Saturday) of `date` as reckoned in a fixed-offset
  // zone (e.g. IST = +330 minutes), independent of the machine's own system
  // timezone. Used for vara and for any weekday-keyed lookup (hora start,
  // Rahu/Yama/Gulika tables), since the viewing device's OS timezone should
  // never change which Vedic day we think it is.
  function weekdayAtOffset(date, utcOffsetMinutes) {
    const shifted = new Date(date.getTime() + utcOffsetMinutes * 60000);
    return shifted.getUTCDay();
  }

  // Generic forward/backward search for the time at which a periodic, degree-valued
  // function of time crosses `targetDeg` (mod 360), starting from `startTime`.
  //
  // angleFn(date) -> degrees in [0, 360)
  // direction: +1 to search forward in time, -1 to search backward
  // stepMinutes: coarse scan step used to bracket the crossing before bisecting
  // maxDays: give up (return null) after searching this many days
  //
  // Works for angles that increase (direction +1) or decrease (direction -1) roughly
  // monotonically over the scan step, which holds for Sun/Moon ecliptic longitude at
  // step sizes well under a day.
  function findAngleCrossing(angleFn, startTime, targetDeg, options) {
    options = options || {};
    const direction = options.direction || 1;
    const stepMinutes = options.stepMinutes || 15;
    const maxDays = options.maxDays || 3;
    const stepMs = direction * stepMinutes * 60 * 1000;

    function g(date) {
      return wrapSigned180(angleFn(date) - targetDeg);
    }

    let tPrev = startTime;
    let gPrev = g(tPrev);
    const maxSteps = Math.ceil((maxDays * MS_PER_DAY) / Math.abs(stepMs));

    for (let i = 0; i < maxSteps; i++) {
      const tNext = new Date(tPrev.getTime() + stepMs);
      const gNext = g(tNext);

      // A genuine crossing of the target shows up as a sign change between consecutive
      // samples (not the far side of the circle, which wrapSigned180 keeps impossible by
      // construction as long as the angle advances less than 180 deg per step). Checked
      // both ways because stepping backward (direction=-1) sees g descend through zero
      // rather than ascend.
      if ((gPrev <= 0 && gNext > 0) || (gPrev > 0 && gNext <= 0)) {
        return bisect(tPrev, tNext, gPrev, gNext, g);
      }
      tPrev = tNext;
      gPrev = gNext;
    }
    return null;
  }

  function bisect(tLo, tHi, gLo, gHi, g) {
    // Normalize so `a` is always chronologically earliest: findAngleCrossing's scan
    // can walk backward in time (direction=-1), in which case the sample passed in
    // as "tLo" is actually the later timestamp.
    let a, b, ga;
    if (tLo.getTime() <= tHi.getTime()) {
      a = tLo; b = tHi; ga = gLo;
    } else {
      a = tHi; b = tLo; ga = gHi;
    }
    // 60 iterations of bisection on a span of at most a day comfortably exceeds
    // sub-second precision; we stop early once the bracket is under 0.25 seconds.
    for (let i = 0; i < 60; i++) {
      const mid = new Date((a.getTime() + b.getTime()) / 2);
      if (b.getTime() - a.getTime() < 250) return mid;
      const gm = g(mid);
      if ((ga <= 0 && gm > 0) || (ga > 0 && gm <= 0)) {
        b = mid;
      } else {
        a = mid;
        ga = gm;
      }
    }
    return new Date((a.getTime() + b.getTime()) / 2);
  }

  VedicEngine.Util = {
    normDeg,
    wrapSigned180,
    addDays,
    diffDays,
    weekdayAtOffset,
    findAngleCrossing,
    MS_PER_DAY,
  };
})(typeof window !== "undefined" ? window : globalThis);
