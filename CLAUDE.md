# Project notes for Claude

- **Work directly on `master`.** Commit and push to `master`; do not create feature branches or open PRs unless asked.
- Web-only changes (`app.html`, `css/`, `js/`) don't trigger an APK build. Changes under `android/` (non-`.md`) do, on push to `master`.
- Run `node test/run-web-tests.js` before pushing.
