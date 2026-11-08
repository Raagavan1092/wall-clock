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
    ok("widget: on by default; the old day navigator and slider row are gone", await page.evaluate(() => !document.getElementById("loc-widget").hidden && !document.getElementById("time-scrub") && !document.getElementById("day-buttons") && !document.getElementById("time-slider")));
    await page.click("#loc-toggle");
    ok("widget: the pin turns it off, leaving just the buttons", await page.evaluate(() => document.getElementById("loc-widget").hidden && !document.getElementById("btn-switch-time").hidden));
    await page.click("#loc-toggle");
    await page.waitForTimeout(1200);
    {
      const box = await page.locator("#loc-arc").boundingBox();
      const at = async (vx, vy) => {
        await page.mouse.move(box.x + vx * box.width / 464, box.y + vy * box.height / 204);
        await page.mouse.down(); await page.mouse.up();
        return page.evaluate(() => document.getElementById("loc-arc").getAttribute("aria-valuetext"));
      };
      const tickX = await page.evaluate(() => +Array.from(document.querySelectorAll("#loc-arc line")).filter(l => l.getAttribute("stroke") === "#6f80a8")[1].getAttribute("x1"));
      const times = [await at(tickX + 1, 170), await at(tickX + 7, 170), await at(tickX + 10, 170)];
      ok("widget: dragging sticks to an hour tick when close to it", /^\d\d:00$/.test(times[0]), times.join(" "));
      ok("widget: away from the ticks any minute can be picked", times.slice(1).some(t => !/:00$/.test(t)), times.join(" "));
    }
    await page.click("#loc-now");
    ok("widget: shows in the second row, under the top row, with place, time and arc", await page.evaluate(() => {
      const w = document.getElementById("loc-widget"), row = document.querySelector("#top-controls .tc-row");
      return !w.hidden && w.previousElementSibling === row && row.contains(document.getElementById("loc-toggle")) &&
        /Varanasi/.test(document.getElementById("loc-chip-name").textContent) && /N .* E/.test(document.getElementById("loc-coords").textContent) &&
        /\d\d:\d\d/.test(document.getElementById("loc-arc").textContent) && !!document.querySelector("#loc-arc circle");
    }));
    ok("widget: the pin sits beside Settings and Full screen in the top row", await page.evaluate(() => {
      const ids = Array.from(document.querySelectorAll("#top-controls .tc-row > button")).map(b => b.id);
      return ids.join() === "btn-fullview,loc-toggle,settings-toggle";
    }));
    await page.click("#loc-next");
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
    ok("second visit: no prompt, stays unlocked, widget stays on", await page.evaluate(() =>
      document.getElementById("loc-dialog").classList.contains("hidden") && !document.getElementById("stage").hasAttribute("inert") && !document.getElementById("loc-widget").hidden));
    ok("first visit flow: no page errors", errors.length === 0, errors.join("; "));
    await ctx.close();
  }

  await browser.close();
  server.close();
  console.log(failures ? failures + " FAILED" : "ALL PASSED");
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
