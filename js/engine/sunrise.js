// Sunrise/sunset search, with the sunrise-definition setting as an explicit,
// swappable choice rather than a library default.
//
// Two definitions (CONTESTED: texts and software disagree on which is "true sunrise"):
//  - "upper-limb" (default): the Sun's topmost visible edge crosses the horizon,
//    corrected for atmospheric refraction. This is the civil/visual definition
//    used by most panchanga websites (including drikpanchang.com) and almanacs.
//    astronomy-engine's own SearchRiseSet already implements exactly this.
//  - "disc-centre": the geometric centre of the Sun's disc crosses the horizon,
//    with NO refraction correction. This matches the geometric definitions used
//    in classical siddhanta-style texts, which predate any refraction model.
//    astronomy-engine's SearchAltitude(altitude=0) does not apply refraction
//    (documented behavior), which is exactly this definition.
(function (global) {
  "use strict";

  const VedicEngine = global.VedicEngine = global.VedicEngine || {};
  const Astronomy = global.Astronomy;
  if (!Astronomy) {
    throw new Error("sunrise.js must be loaded after js/vendor/astronomy.browser.js");
  }

  const RISE = +1;
  const SET = -1;

  function makeObserver(location) {
    return new Astronomy.Observer(location.latitude, location.longitude, location.elevation || 0);
  }

  // direction: RISE or SET. searchFromDate/limitDays as in astronomy-engine (negative = search backward).
  function searchSun(location, edge, direction, searchFromDate, limitDays) {
    const observer = makeObserver(location);
    let result;
    if (edge === "disc-centre") {
      result = Astronomy.SearchAltitude(Astronomy.Body.Sun, observer, direction, searchFromDate, limitDays, 0);
    } else {
      // "upper-limb" (default). SearchRiseSet's `direction` matches the same +1/-1 convention.
      result = Astronomy.SearchRiseSet(Astronomy.Body.Sun, observer, direction, searchFromDate, limitDays);
    }
    return result ? result.date : null;
  }

  // All four helpers below nudge their search start by 1 second away from
  // `date` in the search direction before calling into astronomy-engine. This
  // matters because `date` is frequently itself an exact rise/set instant
  // returned by one of these same functions (e.g. panchanga.js chains
  // sunriseAfter(governingSunrise) straight off sunriseAtOrBefore's result) -
  // without the nudge, a search starting exactly AT a crossing can land back
  // on that same instant (boundary-inclusive), which silently collapsed
  // nextSunrise to equal governingSunrise and produced backwards/zero-length
  // night intervals until this was caught by testing the dial.

  // Most recent sunrise at or before `date`.
  function sunriseAtOrBefore(location, date, edge) {
    const start = new Date(date.getTime() + 1000);
    return searchSun(location, edge, RISE, start, -3);
  }

  function sunriseAfter(location, date, edge) {
    const start = new Date(date.getTime() + 1000);
    return searchSun(location, edge, RISE, start, 3);
  }

  function sunsetAfter(location, date, edge) {
    const start = new Date(date.getTime() + 1000);
    return searchSun(location, edge, SET, start, 3);
  }

  function sunsetBefore(location, date, edge) {
    const start = new Date(date.getTime() + 1000);
    return searchSun(location, edge, SET, start, -3);
  }

  VedicEngine.Sunrise = {
    RISE,
    SET,
    sunriseAtOrBefore,
    sunriseAfter,
    sunsetAfter,
    sunsetBefore,
  };
})(typeof window !== "undefined" ? window : globalThis);
