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
      // Same date with the historical bija (Bentley, as printed by Burgess), supplied here as test data only.
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
      const ss = E.Panchanga.compute(when, { location: loc, method: "ss-bentley" });
      const ms = performance.now() - t0;
      const hrs = (a, b) => Math.abs(a.getTime() - b.getTime()) / 3600000;
      const seqOk = seq => seq.length >= 1 && seq.every(x => x.segStart < x.segEnd) && seq.filter(x => x.isCurrent).length === 1;
      const bad = E.Panchanga.mergeSettings({ method: "nonsense" }).method;
      // Settings: persisted, and a bad saved value falls back to Drik.
      const key = E.Settings.STORAGE_KEY;
      const old = localStorage.getItem(key);
      localStorage.setItem(key, JSON.stringify({ method: "ss-bentley" }));
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
        ms, bad, loadedSS, loadedBad,
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
    ok("method: a saved choice is loaded back", r.loadedSS === "ss-bentley");
    ok("method: no page errors", errors.length === 0, errors.join("; "));
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

    // the pin button brings the widget into the second row
    ok("widget: closed by default; the old day navigator and slider row are gone", await page.evaluate(() => document.getElementById("loc-widget").hidden && !document.getElementById("time-scrub") && !document.getElementById("day-buttons") && !document.getElementById("time-slider")));
    await page.click("#loc-toggle");
    ok("widget: the clock button opens it", await page.evaluate(() => !document.getElementById("loc-widget").hidden));
    await page.click("#loc-toggle");
    ok("widget: and closes it again, leaving just the buttons", await page.evaluate(() => document.getElementById("loc-widget").hidden && !!document.getElementById("btn-prev-display")));
    await page.click("#loc-toggle");
    await page.waitForTimeout(1200);
    {
      const box = await page.locator("#loc-arc").boundingBox();
      const at = async (vx, vy) => {
        await page.mouse.move(box.x + vx * box.width / 464, box.y + (vy - 14) * box.height / 190);
        await page.mouse.down(); await page.mouse.up();
        return page.evaluate(() => document.getElementById("loc-arc").getAttribute("aria-valuetext"));
      };
      const tickX = await page.evaluate(() => +Array.from(document.querySelectorAll("#loc-arc line")).filter(l => l.getAttribute("stroke") === "#6f80a8")[1].getAttribute("x1"));
      const times = [await at(tickX + 0.2, 170), await at(tickX + 7, 170), await at(tickX + 10, 170)];
      ok("widget: dragging sticks to an hour tick when close to it", /^\d\d:00$/.test(times[0]), times.join(" "));
      ok("widget: away from the ticks any minute can be picked", times.slice(1).some(t => !/:00$/.test(t)), times.join(" "));
    }
    await page.click("#loc-now");
    ok("widget: shows under the top row and the plain buttons, with place, time and arc", await page.evaluate(() => {
      const w = document.getElementById("loc-widget"), row = document.querySelector("#top-controls .tc-row");
      return !w.hidden && w.previousElementSibling === document.querySelector("#top-controls .tc-plain") && row.nextElementSibling === document.getElementById("alarm-section") && row.contains(document.getElementById("loc-toggle")) &&
        /Varanasi/.test(document.getElementById("loc-chip-name").textContent) && /N .* E/.test(document.getElementById("loc-coords").textContent) &&
        /\d\d:\d\d/.test(document.getElementById("loc-arc").textContent) && !!document.querySelector("#loc-arc circle");
    }));
    ok("widget: the clock button sits beside Alarms, Settings and Full screen in the top row", await page.evaluate(() => {
      const ids = Array.from(document.querySelectorAll("#top-controls .tc-row > button")).map(b => b.id);
      return ids.join() === "btn-fullview,alarm-toggle,loc-toggle,settings-toggle";
    }));
    await page.click("#loc-next");
    await page.waitForTimeout(400);
    ok("widget: Next goes to the next day's sunrise (Ghaṭī 0 · Pala 0)", await page.evaluate(() => /Ghaṭī 0 · Pala 0/.test(document.getElementById("dial").textContent)));
    ok("widget: Next moves the clock one day on, Now returns to live", await page.evaluate(async () => {
      const off = document.getElementById("loc-now").classList.contains("is-live");
      document.getElementById("loc-now").click();
      await new Promise(r => setTimeout(r, 300));
      return off === false && document.getElementById("loc-now").classList.contains("is-live");
    }));

    // place menu -> Change location dialog
    await page.click("#loc-chip");
    ok("menu: lists the current place as selected, plus Change location", await page.evaluate(() =>
      !document.getElementById("loc-menu").hidden && document.querySelectorAll("#loc-recent [aria-checked=true]").length === 1 && !!document.getElementById("loc-change")));
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
    await page.click("#loc-chip");
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
    ok("second visit: no prompt, stays unlocked, widget starts closed", await page.evaluate(() =>
      document.getElementById("loc-dialog").classList.contains("hidden") && !document.getElementById("stage").hasAttribute("inert") && document.getElementById("loc-widget").hidden));
    ok("first visit flow: no page errors", errors.length === 0, errors.join("; "));
    await ctx.close();
  }

  await browser.close();
  server.close();
  console.log(failures ? failures + " FAILED" : "ALL PASSED");
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
