// Pre-renders every alarm sound to a loop-ready WAV for the Android app:
//   node tools/render-sounds.js [outDir]        (default: android/app/src/main/res/raw)
//
// The tunes and the bell are synthesised in the browser (Web Audio), which
// native code cannot play, so this renders them offline in headless Chromium
// (Playwright is preinstalled) with the very same code the page uses
// (Tunes.schedulePass, Bell.strikes), as 22.05 kHz mono 16-bit WAV.
//
// Seamless loops: a pass is rendered with a long tail past its end (notes
// ring on into the next pass, exactly as the page overlaps its passes), and
// that tail is added back onto the start, so the file's end flows straight
// into its beginning. Files are named tune_<id with - as _>.wav and bell.wav.
const http = require("http"), fs = require("fs"), path = require("path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const outDir = path.resolve(process.argv[2] || path.join(root, "android/app/src/main/res/raw"));
const RATE = 22050;
const TAIL = 6; // seconds rendered past the pass; longer than any note's decay

const server = http.createServer((req, res) => {
  const file = path.join(root, decodeURIComponent(req.url.split("?")[0]).replace(/\/$/, "/index.html"));
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  const type = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json" }[path.extname(file)] || "application/octet-stream";
  res.writeHead(200, { "content-type": type });
  fs.createReadStream(file).pipe(res);
});

function wav(samples) {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + samples.length * 2, 4); buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(RATE, 24); buf.writeUInt32LE(RATE * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767))), 44 + i * 2);
  return buf;
}

(async () => {
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto("http://localhost:" + server.address().port + "/index.html");
  await page.waitForFunction(() => window.VedicEngine && VedicEngine.AlarmUI && VedicEngine.Tunes, null, { timeout: 30000 });

  // Renders `build(ctx, out)` for `loopSeconds` + TAIL and folds the tail onto the start.
  const render = (jobs) => page.evaluate(async ({ jobs, RATE, TAIL }) => {
    const results = {};
    for (const job of jobs) {
      const total = Math.ceil((job.seconds + TAIL) * RATE);
      const ctx = new OfflineAudioContext(1, total, RATE);
      const master = ctx.createGain();
      master.gain.value = 0.9;
      const limiter = ctx.createDynamicsCompressor(); // as in Tunes.start
      master.connect(limiter); limiter.connect(ctx.destination);
      if (job.kind === "tune") VedicEngine.Tunes.schedulePass(ctx, master, VedicEngine.Tunes.get(job.id), 0);
      else VedicEngine.AlarmUI.Bell.strikes(ctx, 0);
      const data = (await ctx.startRendering()).getChannelData(0);
      const loop = Math.round(job.seconds * RATE);
      const out = new Float32Array(loop);
      for (let i = 0; i < data.length; i++) out[i % loop] += data[i];
      let peak = 0;
      for (let i = 0; i < loop; i++) peak = Math.max(peak, Math.abs(out[i]));
      results[job.name] = { peak, samples: Array.from(out) };
    }
    return results;
  }, { jobs, RATE, TAIL });

  const tunes = await page.evaluate(() => VedicEngine.Tunes.list.map(t => ({ id: t.id, seconds: t.beats * 60 / t.bpm })));
  const jobs = tunes.map(t => ({ kind: "tune", id: t.id, seconds: t.seconds, name: "tune_" + t.id.replace(/-/g, "_") }));
  // The bell's three strikes repeat every PHRASE_SECONDS; the bell is a Bell.strikes call, not a tune.
  const bellSeconds = await page.evaluate(() => VedicEngine.AlarmUI.Bell.PHRASE_SECONDS);
  jobs.push({ kind: "bell", seconds: bellSeconds, name: "bell" });

  fs.mkdirSync(outDir, { recursive: true });
  let bytes = 0;
  for (const job of jobs) {
    const r = (await render([job]))[job.name];
    // Alarms should be loud and even: bring every sound's peak to 0.9 (boosting at most 3x).
    const samples = Float32Array.from(r.samples);
    if (r.peak > 0) {
      const gain = Math.min(3, 0.9 / r.peak);
      for (let i = 0; i < samples.length; i++) samples[i] *= gain;
    }
    if (!(r.peak > 0.02)) throw new Error(job.name + " rendered silent (peak " + r.peak + ")");
    const file = path.join(outDir, job.name + ".wav");
    const buf = wav(samples);
    fs.writeFileSync(file, buf);
    bytes += buf.length;
    console.log(job.name.padEnd(28), job.seconds.toFixed(2).padStart(6) + " s", "peak " + r.peak.toFixed(2), (buf.length / 1024).toFixed(0) + " KB");
  }
  console.log(jobs.length + " files, " + (bytes / 1048576).toFixed(1) + " MB -> " + outDir);
  if (errors.length) console.log("page errors:", errors.join("; "));
  await browser.close();
  server.close();
})().catch(e => { console.error(e); process.exit(1); });
