# Project notes for Claude

- **Work directly on `master`.** Commit and push to `master`; do not create feature branches or open PRs unless asked.
- Web-only changes (`app.html`, `css/`, `js/`) don't trigger an APK build. Changes under `android/` (non-`.md`) do, on push to `master`.
- Run `node test/run-web-tests.js` before pushing.
- Yogas follow Muhūrta Cintāmaṇi (summary of Prakaraṇas 1–2: `docs/muhurta-chintamani-summary.md`). Tables live in `js/data/mc-data.js`, rules in `js/render/mc-yogas.js`: daily windows → Good / Bad Times ring; tithi-vāra-nakṣatra yogas → Secondary yogas view; details → Today Special dialog (`js/today-special.js`). Verse 1.5a follows the commentators (Amṛta, not Mṛtyu). Local practices (e.g. Asal Vākya) are optional, off by default, under Settings > Yogas.
