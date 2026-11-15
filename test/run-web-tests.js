// Runs the web-side tests in headless Chromium (Playwright is preinstalled):
//   node test/run-web-tests.js
// 1. test/alarms-test.html - the alarm engine
// 2. a smoke test of index.html - no console errors, the clock draws
// 3. the Android bridge, against a fake window.AndroidAlarms
// It serves the repo itself on a free port.
const http = require("http"), fs = require("fs"), path = require("path");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "..");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".css": "text/css", ".png": "image/png" };
const server = http.createServer((req, res) => {
  const file = path.join(root, decodeURIComponent(req.url.split("?")[0]).replace(/\/$/, "/index.html"));
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
let failures = 0;
const ok = (name, cond, extra) => { if (!cond) failures++; console.log((cond ? "PASS " : "FAIL ") + name + (extra ? "  - " + extra : "")); };

(async () => {
  await new Promise(r => server.listen(0, r));
  const base = "http://localhost:" + server.address().port;
  const browser = await chromium.launch();

  // 1. engine tests
  {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.goto(base + "/test/alarms-test.html");
    await page.waitForFunction(() => /PASS|FAIL|ERROR/.test(document.title), null, { timeout: 120000 });
    const summary = await page.textContent("#summary");
    const fails = await page.$$eval("li.fail", els => els.map(e => e.textContent));
    fails.forEach(f => console.log("  " + f));
    ok("alarms-test.html: " + summary, !fails.length && /passed/.test(summary) && !errors.length, errors.join("; "));
    await page.close();
  }

  // 2. smoke test of the real page
  {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
    await page.goto(base + "/index.html");
    await page.waitForSelector("#dial *", { timeout: 20000 });
    await page.waitForTimeout(1500);
    ok("smoke: index.html draws the dial with no console errors", errors.length === 0, errors.join("; "));
    ok("smoke: no bridge UI in a plain browser", (await page.$("#alarm-reliable")) === null);
    await page.close();
  }

  // 4. Surya Siddhanta engine: sanity against the modern ephemeris (loose bounds that
  //    catch a wrong constant/epoch/sign, which show up as tens of degrees), plus bija wiring.
  //    SS itself drifts from the real sky; Venus/Mercury/Mars are worst near conjunction,
  //    where the epicycle geometry multiplies a small phase error (Venus up to ~28 deg).
  {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.goto(base + "/index.html");
    await page.waitForSelector("#dial *", { timeout: 20000 });
    const r = await page.evaluate(() => {
      const V = window.VedicEngine, A = window.Astronomy, SS = V.SuryaSiddhanta;
      const AY0 = (85885.53 + 24.2) / 3600;
      const sw = d => ((d + 540) % 360) - 180;
      const modern = (b, d) => {
        if (b === "sun") return V.Util.normDeg(A.SunPosition(d).elon - V.Ayanamsa.lahiri(d));
        if (b === "moon") return V.Util.normDeg(A.EclipticGeoMoon(d).lon - V.Ayanamsa.lahiri(d));
        if (b === "rahu") { const T = (d.getTime() / 86400000 + 2440587.5 - 2451545) / 36525; return V.Util.normDeg(125.04452 - 1934.136261 * T - V.Ayanamsa.lahiri(d)); }
        return V.Util.normDeg(A.Ecliptic(A.GeoVector(b[0].toUpperCase() + b.slice(1), d, true)).elon - AY0);
      };
      const bounds = { sun: 6, moon: 5, rahu: 6, jupiter: 9, saturn: 9, venus: 32, mercury: 18, mars: 30 };
      const dates = [];
      for (let y = 2025; y <= 2027; y++) for (let m = 0; m < 12; m += 2) dates.push(new Date(Date.UTC(y, m, 10, 6)));
      const worst = {};
      Object.keys(bounds).forEach(b => { worst[b] = 0; dates.forEach(d => { worst[b] = Math.max(worst[b], Math.abs(sw(SS.trueLongitude(b, d) - modern(b, d)))); }); });
      const d0 = new Date(Date.UTC(2026, 5, 1));
      const empty = Object.keys(SS.bija.table).length === 0;
      const base0 = SS.trueLongitude("sun", d0), marsBase = SS.trueLongitude("mars", d0);
      SS.bija.set("sun", { epochYear: 2000, constantArcmin: 30, arcminPerYear: 0 });
      SS.bija.set("mars", { epochYear: 2000, constantArcmin: 30, arcminPerYear: 0 });
      const shifted = sw(SS.trueLongitude("sun", d0) - base0);
      const marsMoved = Math.abs(sw(SS.trueLongitude("mars", d0) - marsBase)) > 0.05;
      const noBija = sw(SS.trueLongitude("sun", d0, { applyBija: false }) - base0);
      SS.bija.clear();
      const all = SS.positions(d0);
      const exact = Math.abs(sw(SS.trueLongitude("moon", d0, { exactSine: true }) - SS.trueLongitude("moon", d0)));
      // Burgess 1860 worked table: 1 Jan 1860, midnight at Ujjain (UT = 00:00 minus 75.76667/360 day).
      const b60 = new Date(Date.UTC(1860, 0, 1) - 0.2104630 * 86400000);
      const asec = (s, d, m, x) => s * 108000 + d * 3600 + m * 60 + x;   // arcseconds
      const secOf = deg => deg * 3600;
      const diff = (deg, target) => { let x = secOf(deg) - target; x = ((x + 648000) % 1296000) - 648000; return Math.abs(x); };
      const el = n => SS.elements(n, b60);
      const burgess = {
        ahargana: SS.ahargana(b60),
        sun: diff(el("sun").mean, asec(8, 17, 48, 7)),
        mercury: diff(el("mercury").sighrocca, asec(4, 15, 13, 8)),
        venus: diff(el("venus").sighrocca, asec(10, 21, 8, 59)),
        mars: diff(el("mars").mean, asec(5, 24, 17, 36)),
        jupiter: diff(el("jupiter").mean, asec(2, 26, 0, 7)),
        saturn: diff(el("saturn").mean, asec(3, 20, 11, 13)),
        node: diff(SS.meanLongitude("rahu", b60), asec(9, 24, 26, 4)),
      };
      // Same date with the historical bija set Burgess prints (from Bentley), used here ONLY as test data
      // for the bija mechanism; it is not offered as a calculation method.
      const bentley = { mercury: -16, venus: -12, jupiter: -8, saturn: 12 };
      Object.keys(bentley).forEach(k => SS.bija.set(k, { revsPerMahayuga: bentley[k] }));
      const burgessBija = {
        mercury: diff(el("mercury").sighrocca, asec(4, 8, 36, 16)),
        jupiter: diff(el("jupiter").mean, asec(2, 22, 41, 41)),
        saturn: diff(el("saturn").mean, asec(3, 25, 8, 50)),
      };
      SS.bija.clear();
      return { burgess, burgessBija, worst, bounds, empty, shifted, noBija, restored: SS.trueLongitude("sun", d0) === base0, marsMoved,
        keys: Object.keys(all).sort().join(","), ketu: sw(all.ketu - all.rahu - 180), exact };
    });
    Object.keys(r.bounds).forEach(b => ok("SS " + b + " within " + r.bounds[b] + " deg of modern", r.worst[b] <= r.bounds[b], r.worst[b].toFixed(1) + " deg"));
    ok("SS ahargana for 1 Jan 1860 is Burgess's 1,811,945", Math.abs(r.burgess.ahargana - 1811945) < 1e-3, String(r.burgess.ahargana));
    Object.keys(r.burgess).filter(k => k !== "ahargana").forEach(k => ok("SS mean place '" + k + "' = Burgess 1860 table (within 2 arcsec)", r.burgess[k] <= 2, r.burgess[k].toFixed(1) + '"'));
    Object.keys(r.burgessBija).forEach(k => ok("SS bija revolution change '" + k + "' = Burgess bija column (within 2 arcsec)", r.burgessBija[k] <= 2, r.burgessBija[k].toFixed(1) + '"'));
    ok("SS bija table starts empty", r.empty);
    ok("SS bija entry shifts the Sun by ~0.5 deg for 30 arcmin", Math.abs(r.shifted - 0.5) < 0.05, r.shifted.toFixed(3));
    ok("SS bija on a star-planet moves it too", r.marsMoved);
    ok("SS applyBija:false ignores the table", Math.abs(r.noBija) < 1e-9);
    ok("SS bija.clear() restores pure SS", r.restored);
    ok("SS positions() covers every graha", r.keys === "jupiter,ketu,mars,mercury,moon,rahu,saturn,sun,venus", r.keys);
    ok("SS ketu is 180 deg from rahu", Math.abs(r.ketu) < 1e-9);
    ok("SS table sine vs exact sine agree within 0.3 deg (moon)", r.exact < 0.3, r.exact.toFixed(3));
    ok("SS: no page errors", errors.length === 0, errors.join("; "));
    await page.close();
  }

  // 5. Calculation method: Drik stays the default and unchanged; the Surya Siddhanta + bija
  //    method gives a coherent snapshot a few hours from Drik, never a wild one.
  {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.goto(base + "/index.html");
    await page.waitForSelector("#dial *", { timeout: 20000 });
    const r = await page.evaluate(() => {
      const E = window.VedicEngine;
      const when = new Date(Date.UTC(2026, 5, 15, 6, 0, 0));
      const loc = { latitude: 13.42, longitude: 75.25, elevation: 672, utcOffsetMinutes: 330 };
      const plain = E.Panchanga.compute(when, { location: loc });
      const drik = E.Panchanga.compute(when, { location: loc, method: "drik" });
      const t0 = performance.now();
      const ss = E.Panchanga.compute(when, { location: loc, method: "ss" });
      const ms = performance.now() - t0;
      // The three text-based methods added after plain SS: each gives a coherent snapshot.
      const others = {};
      ["ss-ranganatha", "vakya", "ketkar"].forEach(m => {
        const t1 = performance.now();
        const p = E.Panchanga.compute(when, { location: loc, method: m });
        const sq = seq => seq.length >= 1 && seq.every(x => x.segStart < x.segEnd) && seq.filter(x => x.isCurrent).length === 1;
        others[m] = {
          ms: performance.now() - t1, method: p.settings.method,
          tithiDiffH: Math.abs(p.tithi.endTime - drik.tithi.endTime) / 3600000, tithiDiff: Math.abs(p.tithi.number - drik.tithi.number),
          nakDiff: Math.abs(p.nakshatra.index - drik.nakshatra.index),
          covers: p.tithi.startTime <= when && when < p.tithi.endTime && p.nakshatra.startTime <= when && when < p.nakshatra.endTime,
          seqs: sq(p.tithiSequence) && sq(p.nakshatraSequence) && sq(p.yogaSequence) && sq(p.karanaSequence),
          masa: p.tithiSequence[0].amantaMasaRashiIndex === drik.tithiSequence[0].amantaMasaRashiIndex,
          sunriseSame: p.anchors.governingSunrise.getTime() === drik.anchors.governingSunrise.getTime(),
        };
      });
      const saved = ["ss-ranganatha", "vakya", "ketkar"].map(m => { const k = E.Settings.STORAGE_KEY, o = localStorage.getItem(k); localStorage.setItem(k, JSON.stringify({ method: m })); const v = E.Settings.load().method; if (o === null) localStorage.removeItem(k); else localStorage.setItem(k, o); return v; });
      const hrs = (a, b) => Math.abs(a.getTime() - b.getTime()) / 3600000;
      const seqOk = seq => seq.length >= 1 && seq.every(x => x.segStart < x.segEnd) && seq.filter(x => x.isCurrent).length === 1;
      const bad = E.Panchanga.mergeSettings({ method: "nonsense" }).method;
      const radios = Array.from(document.getElementsByName("calcMethod")).map(r => r.value + (r.disabled ? ":off" : ":on"));
      const pureSS = E.Sidereal.longitude("moon", when, "lahiri", "ss") === E.SuryaSiddhanta.trueLongitude("moon", when, { applyBija: false });
      // Settings: persisted, and a bad saved value falls back to Drik.
      const key = E.Settings.STORAGE_KEY;
      const old = localStorage.getItem(key);
      localStorage.setItem(key, JSON.stringify({ method: "ss" }));
      const loadedSS = E.Settings.load().method;
      localStorage.setItem(key, JSON.stringify({ method: "bogus" }));
      const loadedBad = E.Settings.load().method;
      if (old === null) localStorage.removeItem(key); else localStorage.setItem(key, old);
      return {
        defaultIsDrik: plain.settings.method === "drik" && E.Settings.defaults().method === "drik",
        sameAsPlain: plain.tithi.endTime.getTime() === drik.tithi.endTime.getTime() && plain.nakshatra.endTime.getTime() === drik.nakshatra.endTime.getTime(),
        tithiDiffH: hrs(ss.tithi.endTime, drik.tithi.endTime), tithiDiff: Math.abs(ss.tithi.number - drik.tithi.number),
        nakDiff: Math.abs(ss.nakshatra.index - drik.nakshatra.index), nakEndH: hrs(ss.nakshatra.endTime, drik.nakshatra.endTime),
        yogaEndH: hrs(ss.yoga.endTime, drik.yoga.endTime), karanaEndH: hrs(ss.karana.endTime, drik.karana.endTime),
        covers: ss.tithi.startTime <= when && when < ss.tithi.endTime && ss.nakshatra.startTime <= when && when < ss.nakshatra.endTime,
        seqs: seqOk(ss.tithiSequence) && seqOk(ss.nakshatraSequence) && seqOk(ss.yogaSequence) && seqOk(ss.karanaSequence),
        masa: ss.tithiSequence[0].amantaMasaRashiIndex >= 0 && ss.tithiSequence[0].amantaMasaRashiIndex < 12,
        sunriseSame: ss.anchors.governingSunrise.getTime() === drik.anchors.governingSunrise.getTime(),
        ms, bad, loadedSS, loadedBad, others, saved, radios, pureSS, methods: E.Sidereal.METHODS.join(","), pending: E.Sidereal.PENDING_METHODS.length,
      };
    });
    ok("method: Drik is the default and the setting default", r.defaultIsDrik);
    ok("method: omitting it equals 'drik' exactly", r.sameAsPlain);
    ok("method: SS tithi ends within 14 h of Drik, same or adjacent tithi", r.tithiDiffH < 14 && r.tithiDiff <= 1, r.tithiDiffH.toFixed(1) + " h");
    ok("method: SS nakshatra within one of Drik, ends within 20 h", r.nakDiff <= 1 && r.nakEndH < 20, r.nakEndH.toFixed(1) + " h");
    ok("method: SS yoga/karana end within 20 h of Drik", r.yogaEndH < 20 && r.karanaEndH < 20, r.yogaEndH.toFixed(1) + " / " + r.karanaEndH.toFixed(1) + " h");
    ok("method: SS snapshot brackets 'now' and sequences are well-formed", r.covers && r.seqs);
    ok("method: SS lunar month index is valid", r.masa);
    ok("method: sunrise is unchanged by the method", r.sunriseSame);
    ok("method: SS snapshot computes quickly", r.ms < 1500, r.ms.toFixed(0) + " ms");
    ok("method: unknown value falls back to Drik", r.bad === "drik" && r.loadedBad === "drik");
    ok("method: the five options are listed and all selectable", r.radios.join(",") === "drik:on,ss:on,ss-ranganatha:on,vakya:on,ketkar:on" && r.methods === "drik,ss,ss-ranganatha,vakya,ketkar" && r.pending === 0, r.radios.join(","));
    ok("method: each text-based choice is saved and loaded back", r.saved.join(",") === "ss-ranganatha,vakya,ketkar", r.saved.join(","));
    Object.keys(r.others).forEach(m => {
      const o = r.others[m], lim = m === "ketkar" ? 0.5 : 14;
      ok("method " + m + ": tithi ends within " + lim + " h of Drik, same or adjacent tithi, nakshatra within one", o.method === m && o.tithiDiffH < lim && o.tithiDiff <= 1 && o.nakDiff <= 1, o.tithiDiffH.toFixed(2) + " h");
      ok("method " + m + ": snapshot brackets 'now', sequences well-formed, same lunar month and sunrise as Drik", o.covers && o.seqs && o.masa && o.sunriseSame);
      ok("method " + m + ": snapshot computes quickly", o.ms < 1500, o.ms.toFixed(0) + " ms");
    });
    ok("method: 'ss' is pure Surya Siddhanta (no bija)", r.pureSS);
    ok("method: a saved choice is loaded back", r.loadedSS === "ss");
    ok("method: no page errors", errors.length === 0, errors.join("; "));
    await page.close();
  }

  // 6. The text-based engines against the worked examples printed in their own books
  //    (docs/graha-sphuta-sources.md), and loosely against the modern ephemeris.
  {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.goto(base + "/index.html");
    await page.waitForSelector("#dial *", { timeout: 20000 });
    const r = await page.evaluate(() => {
      const V = window.VedicEngine, A = window.Astronomy, SS = V.SuryaSiddhanta, VK = V.Vakya, K = V.Ketaki;
      const deg = (s, d, m, x) => s * 30 + d + m / 60 + (x || 0) / 3600;
      const sw = d => ((d + 540) % 360) - 180;
      const asec = (got, want) => Math.abs(sw(got - want)) * 3600;
      const UJ = 75.76667 / 360;
      // --- Vakyakarana: Kali day 1844004 (sunrise at Ujjain, Saturday 11 Oct 1947) ---
      const vkDate = new Date((1844004 + 588465.75 - UJ - 2440587.5) * 86400000);
      const vk = {
        kaliDays: VK.kaliDays(vkDate), weekday: vkDate.getUTCDay(),
        mesha: VK._internals.meshaSankramana(5048),
        sun: asec(VK.trueLongitude("sun", vkDate), deg(5, 23, 28, 33)),
        moon: asec(VK.trueLongitude("moon", vkDate), deg(4, 11, 17, 32)),
        rahu: asec(VK.trueLongitude("rahu", vkDate), deg(1, 1, 6, 34)),
        ketu: sw(VK.trueLongitude("ketu", vkDate) - VK.trueLongitude("rahu", vkDate) - 180),
        vakya154: VK._internals.MOON_VAKYA[154] === (7 * 30 + 21) * 60 + 48 && VK._internals.MOON_VAKYA.length === 249,
      };
      // The Moon runs smoothly through a day and across the 248-day and 3031-day joins.
      let moonStep = 0;
      for (let h = 0; h < 24 * 300; h += 6) {
        const a = new Date(Date.UTC(2026, 0, 1) + h * 3600000), b = new Date(a.getTime() + 6 * 3600000);
        const s = sw(VK.trueLongitude("moon", b) - VK.trueLongitude("moon", a));
        if (s < 2.8 || s > 3.9) moonStep++;
      }
      // Planets (ch. II): the book's Mars and Venus examples for the same day, Saturn's reduction
      // for the Mesha sankramana of Saka 1869, and each sodhya against the mean Sun there.
      const VI = VK._internals, P5 = ["mars", "mercury", "jupiter", "venus", "saturn"];
      const vkp = {
        mars: asec(VK.trueLongitude("mars", vkDate), deg(3, 11, 13, 55)), venus: asec(VK.trueLongitude("venus", vkDate), deg(6, 2, 26, 27)),
        marsRed: VI.planetReduce("mars", 1844004), venusRed: VI.planetReduce("venus", 1844004), saturnRed: VI.planetReduce("saturn", VI.meshaSankramana(5048)),
        counts: P5.map(b => V.VakyaPlanets[b].length + ":" + V.VakyaPlanets[b].reduce((n, c) => n + c.length, 0) / (b === "venus" ? 4 : 3)).join(","),
        sodhya: Math.max.apply(null, P5.map(b => { const p = VI.PLANETS[b]; return Math.abs(sw((p.sodhya[0] / 365.258681 % 1) * 360 - (p.apogee + p.sodhya[1] / 60))); })),
        covered: P5.every(b => { const p = VI.PLANETS[b]; return V.VakyaPlanets[b].length * p.cycle >= p.mandalas[p.mandalas.length - 1][0] - 3; }),
        keys: Object.keys(VK.positions(vkDate)).sort().join(","),
      };
      let unknownThrows = false; try { VK.trueLongitude("pluto", vkDate); } catch (e) { unknownThrows = /Unknown body/.test(e.message); }
      // --- Ketaki: Saka 1815 Caitra purnima, Saturday 1 Apr 1893, Ujjain mean sunrise (ahargana 5477) ---
      const kDate = new Date(Date.UTC(1878, 3, 3) + (0.25 - UJ + 5477) * 86400000);
      const KI = K._internals;
      const kt = {
        ahargana: K.ahargana(kDate), weekday: kDate.getUTCDay(), epochWeekday: new Date(Date.UTC(1878, 3, 3)).getUTCDay(),
        mean: {
          sun: asec(KI.meanOf("sun", 5477), deg(11, 17, 15, 46)), moon: asec(KI.meanOf("moon", 5477), deg(5, 12, 11, 46)),
          moonApogee: asec(KI.meanOf("moonApogee", 5477), deg(7, 7, 19, 36)), rahu: asec(KI.meanOf("rahu", 5477), deg(0, 7, 22, 19)),
          mars: asec(KI.meanOf("mars", 5477), deg(1, 29, 19, 37)), mercury: asec(KI.meanOf("mercury", 5477), deg(4, 26, 14, 10)),
          jupiter: asec(KI.meanOf("jupiter", 5477), deg(0, 10, 45, 26)), venus: asec(KI.meanOf("venus", 5477), deg(11, 0, 19, 50)),
          saturn: asec(KI.meanOf("saturn", 5477), deg(5, 11, 36, 32)),
        },
        jsKarsa: KI.jupiterKarsa(5477) * 60,
        sun: asec(K.trueLongitude("sun", kDate), deg(11, 19, 10, 37)),
        moonBook: asec(KI.moonFromMean(deg(5, 11, 59, 42), deg(11, 17, 15, 46), deg(7, 7, 19, 36), deg(0, 7, 22, 19)), deg(5, 16, 7, 4)),
        helio: {
          mars: asec(KI.heliocentric("mars", 5477).lon, deg(2, 9, 5, 31)), mercury: asec(KI.heliocentric("mercury", 5477).lon, deg(5, 18, 47, 50)),
          jupiter: asec(KI.heliocentric("jupiter", 5477).lon, deg(0, 13, 5, 50)), venus: asec(KI.heliocentric("venus", 5477).lon, deg(10, 29, 48, 14)),
          saturn: asec(KI.heliocentric("saturn", 5477).lon, deg(5, 17, 19, 20)),
        },
        geo: {
          mars: asec(K.trueLongitude("mars", kDate), deg(1, 9, 54, 51)), mercury: asec(K.trueLongitude("mercury", kDate), deg(11, 19, 25, 29)),
          jupiter: asec(K.trueLongitude("jupiter", kDate), deg(0, 9, 18, 43)), venus: asec(K.trueLongitude("venus", kDate), deg(11, 11, 2, 24)),
          saturn: asec(K.trueLongitude("saturn", kDate), deg(5, 17, 5, 58)),
        },
        ayanamsa: asec(K.ayanamsa(new Date(kDate.getTime() + 13 * 86400000)), deg(0, 22, 21, 6)),
        keys: Object.keys(K.positions(kDate)).sort().join(","),
      };
      // Ketaki vs the modern ephemeris reduced by Ketkar's own ayanamsa, 1900-2100.
      const modern = (b, d) => b === "sun" ? A.SunPosition(d).elon : b === "moon" ? A.EclipticGeoMoon(d).lon : A.Ecliptic(A.GeoVector(b[0].toUpperCase() + b.slice(1), d, true)).elon;
      const kWorst = {}, vWorst = { sun: 0, moon: 0 };
      for (let y = 1900; y <= 2100; y += 2) for (let m = 0; m < 12; m += 1) {
        const d = new Date(Date.UTC(y, m, 11, 3));
        ["sun", "moon", "mars", "mercury", "jupiter", "venus", "saturn"].forEach(b => { kWorst[b] = Math.max(kWorst[b] || 0, Math.abs(sw(K.trueLongitude(b, d) - (modern(b, d) - K.ayanamsa(d))))); });
        ["sun", "moon", "mars", "mercury", "jupiter", "venus", "saturn"].forEach(b => { vWorst[b] = Math.max(vWorst[b] || 0, Math.abs(sw(VK.trueLongitude(b, d) - (modern(b, d) - V.Ayanamsa.lahiri(d))))); });
      }
      // Ketaki's mean places step by a few arcseconds where a 6940-day cycle ends (next: 2030); nothing larger.
      let kJump = 0;
      { const end = new Date(Date.UTC(1878, 3, 3) + (0.25 - UJ + 8 * 6940) * 86400000);
        ["sun", "moon"].forEach(b => { kJump = Math.max(kJump, Math.abs(sw(K.trueLongitude(b, new Date(end.getTime() + 1000)) - K.trueLongitude(b, new Date(end.getTime() - 1000)))) * 3600); }); }
      // --- Makaranda: digits reduce to whole revolutions in SS's civil days ---
      const R = SS.MAKARANDA_RATE, D = 1577917828;
      const revs = k => R[k] * D / 360;
      const d0 = new Date(Date.UTC(2026, 5, 1));
      const plain = b => SS.trueLongitude(b, d0, { applyBija: false }), mk = b => SS.trueLongitude(b, d0, { school: "makaranda" });
      const el = (b, o) => SS.elements(b, d0, o);
      const years = SS.ahargana(d0) / D * 4320000;    // solar years since the Kali epoch
      const mkr = {
        revs: { sun: revs("sun") - 4320000, moon: revs("moon") - 57753336, apogee: revs("moonApogee") - 488199, mars: revs("mars") - 2296832,
          mercury: revs("mercurySighra") - 17937076, jupiter: revs("jupiter") - 364212, venus: revs("venusSighra") - 7022364, saturn: revs("saturn") - 146580, node: revs("moonNode") + 232238 },
        sunSame: Math.abs(sw(mk("sun") - plain("sun"))) * 3600, moonMeanSame: Math.abs(sw(el("moon", { school: "makaranda" }).mean - el("moon", { applyBija: false }).mean)) * 3600,
        apogeeShift: sw(el("moon", { school: "makaranda" }).apogee - el("moon", { applyBija: false }).apogee) - (-4 * years / 4320000 * 360),
        moonMoved: Math.abs(sw(mk("moon") - plain("moon"))),
        mercuryShift: sw(el("mercury", { school: "makaranda" }).sighrocca - el("mercury", { applyBija: false }).sighrocca) - (16 * years / 4320000 * 360),
        saturnShift: sw(el("saturn", { school: "makaranda" }).mean - el("saturn", { applyBija: false }).mean) - (12 * years / 4320000 * 360),
        jupiterShift: sw(el("jupiter", { school: "makaranda" }).mean - el("jupiter", { applyBija: false }).mean) - (-8 * years / 4320000 * 360),
        wired: V.Sidereal.longitude("moon", d0, "lahiri", "ss-ranganatha") === mk("moon") && V.Sidereal.longitude("moon", d0, "lahiri", "vakya") === VK.trueLongitude("moon", d0)
          && V.Sidereal.longitude("sun", d0, "lahiri", "ketkar") === K.trueLongitude("sun", d0),
        ignoresBija: (() => { SS.bija.set("moon", { constantArcmin: 60 }); const x = mk("moon"); SS.bija.clear(); return x === mk("moon"); })(),
      };
      // No planet jumps: day-to-day motion stays within its natural range for 60 years.
      const vkSteps = {};
      { const lim = { mars: 1.0, mercury: 2.6, jupiter: 0.35, venus: 1.5, saturn: 0.2 };
        P5.forEach(b => { let bad = 0, prev = VI.planet(b, 1840000); for (let t = 1840001; t < 1862000; t++) { const x = VI.planet(b, t); if (Math.abs(sw(x - prev)) > lim[b]) bad++; prev = x; } vkSteps[b] = bad; }); }
      return { vk, vkp, vkSteps, moonStep, unknownThrows, kt, kWorst, vWorst, kJump, mkr };
    });
    ok("Vakya: Kali day count and weekday of the worked example (1844004, Saturday)", Math.abs(r.vk.kaliDays - 1844004) < 1e-6 && r.vk.weekday === 6, r.vk.kaliDays + " / " + r.vk.weekday);
    ok("Vakya: Mesha sankramana of Kali 5048 = 1843823 d 40 n 19 v", Math.abs(r.vk.mesha - (1843823 + 40 / 60 + 19 / 3600)) < 1 / 3600, String(r.vk.mesha));
    ok("Vakya: true Sun = book's 5r23°28'33\" (within 2\")", r.vk.sun <= 2, r.vk.sun.toFixed(1) + '"');
    ok("Vakya: true Moon = book's 4r11°17'32\" (within 2\")", r.vk.moon <= 2, r.vk.moon.toFixed(1) + '"');
    ok("Vakya: Rahu = book's 1r1°6'34\" (within 2\")", r.vk.rahu <= 2, r.vk.rahu.toFixed(1) + '"');
    ok("Vakya: ketu opposite rahu; 248 Moon vakyas loaded", Math.abs(r.vk.ketu) < 1e-9 && r.vk.vakya154);
    ok("Vakya: Moon moves 11.2-15.6 deg/day everywhere through 300 days (no jumps at cycle joins)", r.moonStep === 0, r.moonStep + " bad steps");
    ok("Vakya: true Mars = book's 3r11°13'55\" (within 2\"); dhruva -852', 12th cycle, day 259.1", r.vkp.mars <= 2 && r.vkp.marsRed.dhruva === -852 && r.vkp.marsRed.cycle === 11 && Math.abs(r.vkp.marsRed.day - 259.1) < 0.001, r.vkp.mars.toFixed(1) + '"');
    ok("Vakya: true Venus = book's 6r2°26'27\" (within 2\"); dhruva -876', 3rd cycle, day 29.45", r.vkp.venus <= 2 && r.vkp.venusRed.dhruva === -876 && r.vkp.venusRed.cycle === 2 && Math.abs(r.vkp.venusRed.day - 29.45) < 0.001, r.vkp.venus.toFixed(1) + '"');
    ok("Vakya: Saturn reduction = book's dhruva -210', 18th cycle, day 275-49-19", r.vkp.saturnRed.dhruva === -210 && r.vkp.saturnRed.cycle === 17 && Math.abs(r.vkp.saturnRed.day - (275 + 49 / 60 + 19 / 3600)) < 0.001, JSON.stringify(r.vkp.saturnRed));
    ok("Vakya: mahavakya tables complete (cycles:vakyas Ma 15:570, Me 22:528, Ju 11:231, Ve 5:195, Sa 29:551) and cover the smallest mandala", r.vkp.counts === "15:570,22:528,11:231,5:195,29:551" && r.vkp.covered, r.vkp.counts);
    ok("Vakya: at each sodhya the mean Sun equals apogee + dhruva (within 0.02 deg)", r.vkp.sodhya < 0.02, r.vkp.sodhya.toFixed(3));
    ok("Vakya: no planet jumps day to day over 60 years (table slips would show here)", Object.keys(r.vkSteps).every(b => r.vkSteps[b] === 0), JSON.stringify(r.vkSteps));
    ok("Vakya: planets within the text's known drift of modern, 1900-2100 (Ma 12, Me 28, Ju 4, Ve 12, Sa 12 deg)", r.vWorst.mars < 12 && r.vWorst.mercury < 28 && r.vWorst.jupiter < 4 && r.vWorst.venus < 12 && r.vWorst.saturn < 12, ["mars", "mercury", "jupiter", "venus", "saturn"].map(b => r.vWorst[b].toFixed(1)).join(" "));
    ok("Vakya: positions() covers every graha; an unknown body throws", r.vkp.keys === "jupiter,ketu,mars,mercury,moon,rahu,saturn,sun,venus" && r.unknownThrows, r.vkp.keys);
    ok("Vakya: Sun within 1 deg and Moon within 5 deg of modern (Lahiri), 1900-2100", r.vWorst.sun < 1 && r.vWorst.moon < 5, r.vWorst.sun.toFixed(2) + " / " + r.vWorst.moon.toFixed(2));
    ok("Ketaki: epoch is a Wednesday, the example day a Saturday with ahargana 5477", r.kt.epochWeekday === 3 && r.kt.weekday === 6 && Math.abs(r.kt.ahargana - 5477) < 1e-6);
    Object.keys(r.kt.mean).forEach(k => ok("Ketaki mean '" + k + "' = book's example (within 12\")", r.kt.mean[k] <= 12, r.kt.mean[k].toFixed(1) + '"'));
    ok("Ketaki: Jupiter-Saturn inequality = book's 15'51\"", Math.abs(r.kt.jsKarsa - 15.85) < 0.02, r.kt.jsKarsa.toFixed(3) + "'");
    ok("Ketaki: true Sun = book's 11r19°10'37\" (within 2\")", r.kt.sun <= 2, r.kt.sun.toFixed(1) + '"');
    ok("Ketaki: true Moon from the book's inputs = 5r16°7'4\" (within 30\")", r.kt.moonBook <= 30, r.kt.moonBook.toFixed(1) + '"');
    Object.keys(r.kt.helio).forEach(k => ok("Ketaki heliocentric '" + k + "' = book (within 3')", r.kt.helio[k] <= 180, (r.kt.helio[k] / 60).toFixed(1) + "'"));
    Object.keys(r.kt.geo).forEach(k => ok("Ketaki geocentric '" + k + "' = book (within " + (k === "mars" ? 15 : 3) + "')", r.kt.geo[k] <= (k === "mars" ? 900 : 180), (r.kt.geo[k] / 60).toFixed(1) + "'"));
    ok("Ketaki: ayanamsa at Mesha sankranti of Saka 1815 = book's 22°21'6\" (within 3\")", r.kt.ayanamsa <= 3, r.kt.ayanamsa.toFixed(1) + '"');
    ok("Ketaki: positions() covers every graha", r.kt.keys === "jupiter,ketu,mars,mercury,moon,rahu,saturn,sun,venus", r.kt.keys);
    ok("Ketaki: Sun within 0.05 deg, Moon within 0.3 deg of modern, 1900-2100", r.kWorst.sun < 0.05 && r.kWorst.moon < 0.3, r.kWorst.sun.toFixed(3) + " / " + r.kWorst.moon.toFixed(2));
    ok("Ketaki: planets within 2 deg of modern, 1900-2100", ["mars", "mercury", "jupiter", "venus", "saturn"].every(b => r.kWorst[b] < 2), ["mars", "mercury", "jupiter", "venus", "saturn"].map(b => r.kWorst[b].toFixed(2)).join(" "));
    ok("Ketaki: Sun and Moon step under 30\" where a 6940-day cycle ends", r.kJump < 30, r.kJump.toFixed(1) + '"');
    ok("Makaranda: daily motions = whole revolutions in SS civil days (Sun, Moon, Mars unchanged; apogee -4, Mercury +16, Jupiter -8, Venus -12, Saturn +12)",
      ["sun", "moon", "apogee", "mars", "mercury", "jupiter", "venus", "saturn"].every(k => Math.abs(r.mkr.revs[k]) < 0.001) && Math.abs(r.mkr.revs.node) < 0.3, JSON.stringify(r.mkr.revs));
    ok("Makaranda: Sun and mean Moon equal plain SS (within 1\")", r.mkr.sunSame < 1 && r.mkr.moonMeanSame < 1, r.mkr.sunSame.toFixed(2) + " / " + r.mkr.moonMeanSame.toFixed(2));
    ok("Makaranda: apogee, Mercury, Jupiter and Saturn are shifted from SS by exactly their bija", [r.mkr.apogeeShift, r.mkr.mercuryShift, r.mkr.jupiterShift, r.mkr.saturnShift].every(x => Math.abs(x) < 0.001), [r.mkr.apogeeShift, r.mkr.mercuryShift, r.mkr.jupiterShift, r.mkr.saturnShift].map(x => x.toFixed(5)).join(" "));
    ok("Makaranda: true Moon differs from plain SS, by under 0.3 deg", r.mkr.moonMoved > 0.001 && r.mkr.moonMoved < 0.3, r.mkr.moonMoved.toFixed(3));
    ok("Makaranda: the user bija table is not applied on top", r.mkr.ignoresBija);
    ok("methods are wired to their engines", r.mkr.wired);
    ok("text engines: no page errors", errors.length === 0, errors.join("; "));
    await page.close();
  }

  // 3. bridge against a fake native side
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
    await page.addInitScript(() => {
      localStorage.removeItem("vedicWallClock.alarms.v1");
      const calls = { sync: [], track: [], ack: [], setup: 0, cleared: 0 };
      window.__calls = calls;
      window.__rang = [];
      window.AndroidAlarms = {
        sync: json => calls.sync.push(JSON.parse(json)),
        getRang: () => JSON.stringify(window.__rang),
        ackRang: t => calls.ack.push(t),
        trackBegin: n => { calls.track.push(["begin", n]); },
        trackChunk: b => { calls.track.push(["chunk", b.length]); },
        trackEnd: () => { calls.track.push(["end"]); },
        clearTrack: () => { calls.cleared++; },
        openSetup: () => { calls.setup++; },
        getDisplayPrefs: () => JSON.stringify({ keepOn: false, webUpdates: true }),
        setDisplayPref: (k, v) => { (calls.display = calls.display || {})[k] = v; },
        setWidgetData: json => { (calls.widgets = calls.widgets || []).push(JSON.parse(json)); },
        openUpdate: () => { calls.update = (calls.update || 0) + 1; },
      };
    });
    await page.goto(base + "/index.html");
    await page.waitForSelector("#dial *", { timeout: 20000 });
    await page.waitForFunction(() => window.__calls.sync.length >= 1, null, { timeout: 15000 });
    ok("bridge: syncs once on open even with no alarms", await page.evaluate(() => window.__calls.sync[0].rings.length === 0 && window.__calls.sync[0].alarmCount === 0));
    ok("bridge: no alarm note; checklist button, Display section and updates last", await page.evaluate(() => !!document.getElementById("alarm-reliable") && !document.querySelector("#alarm-section .settings-note") &&
      !!document.querySelector("#display-section") && document.querySelector(".settings-actions").previousElementSibling.id === "app-update" && !document.getElementById("update-section")));
    await page.waitForFunction(() => window.__calls.widgets && window.__calls.widgets.length >= 1, null, { timeout: 15000 });
    ok("bridge: widget data has sunrises, tithis and nakshatras that end in the future", await page.evaluate(() => {
      const w = window.__calls.widgets[0], now = Date.now();
      return w.sunrises.length === 4 && w.tithis.length >= 3 && w.nakshatras.length >= 3 && w.tithis[0].e > now && w.nakshatras[0].e > now &&
        w.tithis.every((t, i) => t.n && (i === 0 || t.e > w.tithis[i - 1].e)) && w.nakshatras.every(n => n.n);
    }));
    await page.evaluate(() => { document.querySelector("#display-section input").click(); });
    ok("bridge: Display options reach the app", await page.evaluate(() => window.__calls.display && window.__calls.display.keepOn === true));
    await page.evaluate(() => document.getElementById("alarm-reliable").click());
    ok("bridge: the button opens the native checklist", await page.evaluate(() => window.__calls.setup === 1));
    await page.evaluate(() => document.getElementById("app-update").click());
    ok("bridge: Check for updates opens the native updater", await page.evaluate(() => window.__calls.update === 1));

    const n0 = await page.evaluate(() => window.__calls.sync.length);
    await page.evaluate(() => {
      const A = VedicEngine.Alarms;
      A.add({ events: ["sun:rise"], mode: "before", offsetValue: 15, offsetUnit: "min", repeat: "always", label: "Wake", soundKind: "tune:reveille-rush", notify: true });
      A.add({ events: ["win:rahu"], mode: "start", repeat: "once", soundKind: "track" });
    });
    await page.waitForFunction(n => window.__calls.sync.length > n && window.__calls.sync[window.__calls.sync.length - 1].alarmCount === 2, n0, { timeout: 60000 });
    const p = await page.evaluate(() => window.__calls.sync[window.__calls.sync.length - 1]);
    const now = Date.now(), DAY = 86400000;
    const wake = p.rings.filter(r => r.label === "Wake"), rahu = p.rings.filter(r => r.label !== "Wake");
    ok("bridge: 40 daily rings for the repeating alarm", wake.length === 40, String(wake.length));
    ok("bridge: rings are future, sorted, keyed, within 75 days", p.rings.every((r, i) => r.fireAtMs > now - 1000 && r.fireAtMs < now + 76 * DAY && r.key === r.alarmId + ":" + r.fireAtMs && (i === 0 || r.fireAtMs >= p.rings[i - 1].fireAtMs)));
    ok("bridge: sound, notify, repeat and text carried over", wake[0].soundKind === "tune:reveille-rush" && wake[0].notify === true && wake[0].repeat === "always" && wake[0].items[0].line.indexOf("In 15 min") === 0 && wake[0].title.length > 0 && wake[0].items[0].group.length > 0, JSON.stringify(wake[0].items[0]));
    ok("bridge: the once-alarm has its rings and 'track' sound", rahu.length > 0 && rahu[0].repeat === "once" && rahu[0].soundKind === "track");
    ok("bridge: coveredUntil is the last of the 40 daily rings", Math.abs(p.coveredUntil - wake[39].fireAtMs) < 1000 || p.coveredUntil <= wake[39].fireAtMs);
    ok("bridge: the page itself does not ring (no overlay)", await page.evaluate(() => !document.querySelector(".alarm-ring")));

    // native rang the once-alarm while the page was away
    const onceRing = rahu[0];
    await page.evaluate(r => { window.__rang = [{ alarmId: r.alarmId, fireAtMs: r.fireAtMs, rangAtMs: r.fireAtMs + 1500 }]; }, onceRing);
    await page.evaluate(() => VedicEngine.AndroidBridge.sync(true));
    const after = await page.evaluate(id => ({ a: VedicEngine.Alarms.get(id), ack: window.__calls.ack.slice(), last: window.__calls.sync[window.__calls.sync.length - 1] }), onceRing.alarmId);
    ok("bridge: a ring the app made is recorded (once-alarm switches off)", after.a.enabled === false && after.a.lastRang === onceRing.fireAtMs + 1500 && after.ack.includes(onceRing.fireAtMs + 1500));
    ok("bridge: ...and its rings are gone from the next sync", after.last.rings.every(r => r.alarmId !== onceRing.alarmId) && after.last.alarmCount === 1);

    // user track copy
    await page.evaluate(async () => { await VedicEngine.AndroidBridge.sendTrack("song.mp3", new Uint8Array(1300000).fill(7).buffer); });
    const tr = await page.evaluate(() => window.__calls.track);
    ok("bridge: a track is copied in chunks (begin, chunks, end)", tr[0][0] === "begin" && tr[0][1] === "song.mp3" && tr[tr.length - 1][0] === "end" && tr.filter(t => t[0] === "chunk").length === 3, JSON.stringify(tr));
    ok("bridge: no console errors", errors.length === 0, errors.join("; "));
    await ctx.close();
  }

  // 4. first visit: the Change location dialog must be answered first; that location becomes the default
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
    await page.goto(base + "/index.html");
    await page.waitForSelector("#loc-dialog:not(.hidden)", { timeout: 20000 });
    ok("first visit: the Change location dialog opens by itself, fields empty", await page.evaluate(() => document.getElementById("loc-lat").value === ""));
    ok("first visit: default/reset/close/cancel are inactive and the clock is inert", await page.evaluate(() =>
      ["loc-default", "loc-reset", "loc-close", "loc-cancel"].every(id => document.getElementById(id).disabled) &&
      document.getElementById("stage").hasAttribute("inert")));
    await page.keyboard.press("Escape");
    ok("first visit: Esc does not dismiss it", await page.evaluate(() => !document.getElementById("loc-dialog").classList.contains("hidden")));
    await page.click("#loc-apply");
    ok("first visit: Apply without a location is refused", await page.evaluate(() => !document.getElementById("loc-dialog").classList.contains("hidden")));
    await page.fill("#loc-search", "banaras");
    await page.keyboard.press("Enter");
    ok("search: 'banaras' fills Varanasi's coordinates", await page.evaluate(() => Math.abs(+document.getElementById("loc-lat").value - 25.3) < 0.5 && +document.getElementById("loc-elev").value > 50));
    await page.click("#loc-apply");
    ok("first location is applied, saved as the default, and everything unlocks", await page.evaluate(() =>
      document.getElementById("loc-dialog").classList.contains("hidden") && !document.getElementById("stage").hasAttribute("inert") &&
      Math.abs(JSON.parse(localStorage.getItem("vedicWallClock.settings.v1")).location.latitude - 25.3) < 0.5 &&
      /Varanasi/.test(JSON.parse(localStorage.getItem("vedicWallClock.defaultLocation.v1")).name)));

    // edit mode: day navigators, Now, the date field and the draggable day hand
    ok("top row: no time widget; Full screen, Alarms, Location, Edit, Settings", await page.evaluate(() => {
      const ids = Array.from(document.querySelectorAll("#top-controls .tc-row > button")).map(b => b.id);
      return !document.getElementById("loc-widget") && !document.getElementById("loc-arc") && ids.join() === "btn-fullview,alarm-toggle,loc-toggle,edit-toggle,settings-toggle";
    }));
    ok("edit mode: off by default, its controls hidden", await page.evaluate(() =>
      ["btn-prev-day", "btn-next-day", "edit-bar"].every(id => getComputedStyle(document.getElementById(id)).display === "none")));
    await page.click("#edit-toggle");
    ok("edit mode: the pencil shows the day buttons, Now and the date", await page.evaluate(() =>
      ["btn-prev-day", "btn-next-day", "edit-bar"].every(id => getComputedStyle(document.getElementById(id)).display !== "none") &&
      /\d{4}/.test(document.getElementById("edit-date-text").textContent) && document.getElementById("edit-now").classList.contains("is-live")));
    await page.click("#btn-next-day .rc-label");
    await page.waitForTimeout(400);
    ok("edit mode: Next day goes to the next day's sunrise (Ghaṭī 0 · Pala 0)", await page.evaluate(() => /Ghaṭī 0 · Pala 0/.test(document.getElementById("dial").textContent) && !document.getElementById("edit-now").classList.contains("is-live")));
    {
      // drag the day hand a quarter turn clockwise: 15 ghaṭīs on
      const box = await page.locator("#dial").boundingBox();
      const cx = box.x + box.width / 2, cy = box.y + box.height / 2, r = box.width * 0.22;
      await page.mouse.move(cx, cy - r);
      await page.mouse.down();
      for (let i = 1; i <= 9; i++) { const a = i * Math.PI / 18; await page.mouse.move(cx + r * Math.sin(a), cy - r * Math.cos(a)); }
      await page.mouse.up();
      await page.waitForTimeout(300);
      ok("edit mode: dragging the day hand moves the clock (to about Ghaṭī 15)", await page.evaluate(() => /Ghaṭī 1[45] · Pala/.test(document.getElementById("dial").textContent)), await page.evaluate(() => (document.getElementById("dial").textContent.match(/Ghaṭī \d+ · Pala \d+/) || [""])[0]));
    }
    await page.click("#edit-now");
    await page.waitForTimeout(300);
    ok("edit mode: Now returns to live", await page.evaluate(() => document.getElementById("edit-now").classList.contains("is-live")));
    await page.click("#edit-toggle");
    ok("edit mode: the pencil again hides it all", await page.evaluate(() => getComputedStyle(document.getElementById("edit-bar")).display === "none"));

    // place menu -> Change location dialog
    await page.click("#loc-toggle");
    ok("menu: the pin button lists the current place as selected, plus Change location", await page.evaluate(() =>
      /Varanasi/.test(document.getElementById("loc-toggle").title) && !document.getElementById("loc-menu").hidden && document.querySelectorAll("#loc-recent [aria-checked=true]").length === 1 && !!document.getElementById("loc-change")));
    await page.click("#loc-change");
    ok("dialog: Set as default and Reset are inactive while the location equals the default", await page.evaluate(() =>
      !document.getElementById("loc-dialog").classList.contains("hidden") && document.getElementById("loc-default").disabled && document.getElementById("loc-reset").disabled &&
      /Reset to Varanasi/.test(document.getElementById("loc-reset").textContent) && !document.getElementById("loc-close").disabled));
    ok("dialog: editing the latitude makes both active and the place a custom location", await page.evaluate(() => {
      const lat = document.getElementById("loc-lat");
      lat.value = "13.4"; lat.dispatchEvent(new Event("input"));
      return !document.getElementById("loc-default").disabled && !document.getElementById("loc-reset").disabled && /Custom/.test(document.getElementById("loc-current-name").textContent);
    }));
    await page.click("#loc-reset");
    ok("dialog: Reset puts the default back in the fields", await page.evaluate(() =>
      Math.abs(+document.getElementById("loc-lat").value - 25.3) < 0.5 && document.getElementById("loc-default").disabled));
    await page.evaluate(() => { const lat = document.getElementById("loc-lat"); lat.value = "13.4"; lat.dispatchEvent(new Event("input")); });
    await page.click("#loc-default");
    ok("dialog: Set as default saves at once and goes inactive again", await page.evaluate(() =>
      document.getElementById("loc-default").disabled && Math.abs(JSON.parse(localStorage.getItem("vedicWallClock.defaultLocation.v1")).latitude - 13.4) < 1e-6));
    await page.click("#loc-cancel");
    ok("dialog: Cancel closes without applying", await page.evaluate(() =>
      document.getElementById("loc-dialog").classList.contains("hidden") && Math.abs(JSON.parse(localStorage.getItem("vedicWallClock.settings.v1")).location.latitude - 25.3) < 0.5));
    await page.click("#loc-toggle");
    await page.click("#loc-change");
    await page.click("#loc-reset");
    await page.click("#loc-apply");
    ok("dialog: Apply moves the clock there and the place joins the recent list", await page.evaluate(() =>
      Math.abs(JSON.parse(localStorage.getItem("vedicWallClock.settings.v1")).location.latitude - 25.3) > 1 &&
      JSON.parse(localStorage.getItem("vedicWallClock.recentLocations.v1")).length === 2));

    // Settings no longer has a Location section
    await page.click("#settings-toggle");
    ok("settings: the Location section is gone", await page.evaluate(() =>
      !document.getElementById("set-lat") && !document.getElementById("set-place") && !Array.from(document.querySelectorAll("#settings-panel h3")).some(h => /Location/i.test(h.textContent))));
    await page.click("#settings-save");
    ok("settings: Save keeps the chosen location", await page.evaluate(() => Math.abs(JSON.parse(localStorage.getItem("vedicWallClock.settings.v1")).location.latitude - 13.4) < 1e-6));

    await page.reload();
    await page.waitForSelector("#dial *", { timeout: 20000 });
    await page.waitForTimeout(500);
    ok("second visit: no prompt, stays unlocked, menu and edit mode start closed", await page.evaluate(() =>
      document.getElementById("loc-dialog").classList.contains("hidden") && !document.getElementById("stage").hasAttribute("inert") && document.getElementById("loc-menu").hidden && !document.body.classList.contains("edit-mode")));
    ok("first visit flow: no page errors", errors.length === 0, errors.join("; "));
    await ctx.close();
  }

  await browser.close();
  server.close();
  console.log(failures ? failures + " FAILED" : "ALL PASSED");
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
