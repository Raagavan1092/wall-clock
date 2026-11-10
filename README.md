# Vedic Wall Clock

A wall clock that tells time the Vedic way: in **ghati and pala**, with rings for the day's **tithi**,
**nakshatra**, yoga, karana and the good and bad periods. It is set up for Sringeri by default.
It runs in any modern browser, installs as a PWA, and has an Android wrapper with native alarms.

## Features

- Dial showing ghati/pala time, with rings for tithi, nakshatra and auspicious/inauspicious times
- Panchanga computed on the device: sunrise, tithi, nakshatra, yoga, karana, lagna, masa
- A date navigator and picker for looking at other days
- Alarms with selectable tunes
- Works offline (service worker) and installs to the home screen
- Landscape and portrait layouts

## Run it

There is no build step. Serve the folder with any static server and open it:

```bash
python3 -m http.server 8000
```

Then visit <http://localhost:8000/>.

## Layout

| Path | What it is |
| --- | --- |
| `index.html` | Tiny shell that loads everything listed in `app-files.json` |
| `app.html`, `css/` | The app's markup and styles |
| `js/engine/` | Panchanga calculations (sunrise, tithi, nakshatra, ghati, ...); `surya-siddhanta.js` = classical Sūrya Siddhānta positions for all grahas (empty bīja table; a historical Bentley preset is selectable under Settings > Calculation method, default Drik) |
| `js/render/` | Dial drawing |
| `js/alarms.js`, `alarm-ui.js`, `tunes.js` | Alarm engine, UI and sounds |
| `js/location-ui.js` | Location drop-down (place name in the top row) and the Change location dialog; edit mode (pencil button) is in `js/app.js` |
| `js/vendor/` | The bundled [Astronomy Engine](https://github.com/cosinekitty/astronomy) library |
| `android/` | Android app (WebView plus native alarms); see [`android/README.md`](android/README.md) |
| `test/` | Web tests |
| `tools/` | Helper scripts, e.g. alarm sound rendering |

To add a script or stylesheet, list it in `app-files.json`. There are no version numbers to bump.

## Tests

```bash
node test/run-web-tests.js
```

This runs the alarm engine tests, a smoke test of the page in headless Chromium, and the Android bridge
checks. It needs Playwright.

## Android

The Android app loads the site from GitHub Pages, falls back to its last saved copy, and finally to the
copy bundled in the APK. Alarms ring on a locked phone. GitHub builds the APK on every push to `master`.
See [`android/README.md`](android/README.md) for installing and signing.
