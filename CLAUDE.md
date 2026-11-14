# Project notes for Claude

- **Work directly on `master`.** Commit and push to `master`; do not create feature branches or open PRs unless asked.
- Web-only changes (`app.html`, `css/`, `js/`) don't trigger an APK build. Changes under `android/` (non-`.md`) do, on push to `master`.
- Run `node test/run-web-tests.js` before pushing.
- Yogas follow Muhūrta Cintāmaṇi (summary of Prakaraṇas 1–2: `docs/muhurta-chintamani-summary.md`). Tables live in `js/data/mc-data.js`, rules in `js/render/mc-yogas.js`: daily windows → Good / Bad Times ring; tithi-vāra-nakṣatra yogas → Secondary yogas view; details → Today Details dialog (`js/today-special.js`). Verse 1.5a follows the commentators (Amṛta, not Mṛtyu). Local practices (e.g. Asal Vākya) are optional, off by default, under Settings > Yogas.
- Calculation methods (`js/engine/sidereal.js`): `drik`, `ss`, `ss-ranganatha` (Makaranda sāriṇī for now, inside `surya-siddhanta.js`), `vakya` (`vakya.js`; planets not done yet), `ketkar` (`ketaki.js`). Rules, tables, worked examples and implementation status: `docs/graha-sphuta-sources.md`. Each engine is tested against its book's worked example; keep those tests when changing constants.
- Find muhurta (`js/muhurta-finder.js`) uses event rules transcribed from the md's "When is it a good or bad time for N?" section into `js/data/mc-events.js` (one rule per row, with its verse reference). When that md section changes, update `mc-events.js` to match. Date fields use the themed drop-down picker `js/date-picker.js`, never `<input type=date>`.
