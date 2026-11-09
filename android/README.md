# Vedic Wall Clock - Android app

The web app (this repo's `index.html`, `js/`, `css/` ...) wrapped in a WebView, plus **native alarms
that ring on a locked phone**. It does not use the stock Clock app: the app schedules and rings its own.

## How updates reach the phone

* **Web changes (clock, alarm engine, UI)**: a push to `master` publishes the site (GitHub Pages). The app
  fetches the web files from there on every start, so these reach the phone **without a new APK**. It still
  runs at its own `appassets` address, so saved alarms persist and the alarm bridge is never exposed to the site.
* **Offline**: if the site can't be reached, the app uses the last complete copy it saved from the site
  (only if saved by the installed app version), else the copy bundled in the APK. It works with no network.
* **Safety net**: if a page fetched from the site doesn't start within 20 s (the page calls
  `AndroidAlarms.booted()` once it has), the app reloads the bundled copy instead. Alarms already handed
  to Android keep ringing regardless, because native code holds the schedule.
* **Native changes** (anything under `android/`) need a new APK: Releases > newest `VedicWallClock-<version>.apk`, install over the old one.
* The Settings screen has a switch to turn the web updates off (the APK's bundled copy is then always used).
* Rule for web code: it may run with an *older* app, so check a bridge method exists before calling a new one.

## Get the APK (no Android Studio needed)

GitHub builds it when the native code (`android/`) changes on `master`, or when run by hand from the Actions tab (`.github/workflows/android.yml`). Web-side changes don't need a new APK: the app loads its UI from the web.

1. Open the repo on GitHub > **Releases** > the newest `Vedic Wall Clock (Android) build N`.
2. Download `VedicWallClock-<version>.apk` on the phone and open it. Allow "install unknown apps" for the browser/Files app when asked.
3. A new build installs over the old one and **keeps your alarms** (same signing key, see Signing below).

(The workflow run also keeps the APK as an artifact, plus a `-debug` build.)

## First run: "Make alarms reliable"

The app opens its checklist the first time (and later from **Settings > Alarms > Make alarms reliable...**).
Tap every red item:

| Item | Why |
| --- | --- |
| Notifications | the alarm is shown on the lock screen as a notification |
| Exact alarms | ring at the exact second (granted automatically on Android 13+) |
| Full-screen alarm | lets the alarm open over the lock screen (Android 14+ can turn this off) |
| Battery: unrestricted | stops the phone pausing the app in the background |
| OnePlus: auto-launch / background activity | OxygenOS-only; the app cannot detect them, so check them yourself (Settings > Apps > Vedic Wall Clock > Battery usage > Allow background activity). The buttons try OnePlus's own screens and fall back to the app's details page |

Then press **Test alarm in 1 minute**, lock the phone, put it down.

## What to test on the phone (I could not run it on a device)

1. Test alarm with the screen **locked**: loud, over the lock screen, screen turns on. Dismiss works.
2. Same with the app **swiped away** from recents.
3. **Restart** the phone, then test again (the test alarm is lost on restart only if it was still pending - set it after the reboot; real alarms are re-registered).
4. Test with **Do Not Disturb** on (alarms should still ring), and with the alarm volume low (it uses the *alarm* volume).
5. Make a real alarm for a few minutes ahead (e.g. "Sūryodaya, 2 min before" - or any event near now), pick a sound, lock, wait.
6. "My track": pick an audio file in the alarm dialog; an alarm with it should play that file.

## How it works

* **The page computes, native rings.** Alarms follow the Moon (tithi, nakshatra, Rahu Kalam...), so only the JS
  engine can work out when they ring. `js/android-bridge.js` pushes every enabled alarm's next rings (up to 40
  each, within the engine's 75 days) as concrete timestamps through `window.AndroidAlarms.sync(json)` whenever
  alarms or settings change, and at least every 3 hours while the app is open. While the bridge is present the
  page itself never rings.
* **One alarm at a time.** `AlarmScheduler` keeps the schedule (device-protected storage) and registers only the
  next ring with `AlarmManager.setAlarmClock()` (exempt from Doze; shows the system alarm icon). When it fires,
  `AlarmReceiver` rings what is due and registers the following one. Re-registered after reboot (also before the
  first unlock), app update, clock and time-zone change.
* **Missed rings.** A ring missed by up to 5 minutes (e.g. the phone was off) still rings; older ones are
  skipped (same `GRACE_MS` as `js/alarms.js`). Rings due within a minute of each other ring as one.
* **Ringing.** `RingService` (foreground service, `mediaPlayback`) loops the sound on the *alarm* audio stream,
  vibrates and holds a wake lock; its notification has a full-screen intent that opens `RingActivity` over the
  lock screen. Stops on Dismiss, or after 5 minutes (then a "Missed alarm" note is left).
  If the service cannot start, a high-priority notification with the system alarm tone is the fallback.
* **Back to the page.** Alarms the app rang while the page was closed are logged and read back by the page on its
  next start (`getRang`/`ackRang`), so "just once" alarms switch off and nothing rings twice.
* **Sounds.** The 20 tunes and the bell are synthesised in the browser, which native code cannot play, so
  `node tools/render-sounds.js` pre-renders each to a seamless-loop WAV in `app/src/main/res/raw`
  (committed; re-run it if `js/tunes.js` changes). "My track" is copied into the app when you pick it; if it is
  missing the bell plays (like the web version).
* **Web files.** `app/build.gradle.kts` copies `index.html`, `app.html`, `app-files.json`, `manifest.json`,
  `css/`, `js/`, `icons/` from the repo root into the APK at build time and `WebViewAssetLoader` serves them at
  `https://appassets.androidplatform.net/` - so the app works offline and `index.html`'s loader is untouched.

## Known limits

* **Horizon.** Native can only ring rings it has been given. If you never open the app, they run out (up to 75
  days; less for daily events: 40 rings = 40 days). The app posts a note "Alarms are scheduled until <date> -
  open the app to extend" when under 7 days remain (checked daily). It does *not* recompute in the background:
  a hidden WebView job could not be made reliable enough to trust with alarms. Opening the app tops it up.
* **Sound volume.** Alarms use the alarm volume; at zero they are silent (they still vibrate).
* **OnePlus battery managers** can still kill background apps in ways Android's API cannot see; do the OnePlus
  items above.
* After a restart and before the first unlock, your own audio track cannot be read: the bell plays instead.
* Location/ayanamsa/sunrise-definition changes recompute times when the app is open; they take effect natively right after the page re-syncs (a few seconds).

## Building locally

Needs JDK 17+ and the Android SDK (platform 36, build-tools 36):

```
cd android
./gradlew testDebugUnitTest        # JVM tests of the scheduling logic
./gradlew assembleDebug assembleRelease
# APKs: app/build/outputs/apk/{debug,release}/
```

Web-side tests (from the repo root): `node test/run-web-tests.js`.

## Signing

The signing key is **not in git**. The GitHub workflow generates one on its first run and keeps it in the
repo's Actions cache (private to the repo; with no scheduled run it can expire after a week or so of no builds, so for a key that never changes use the repository secrets below), and signs every debug and release
build with it, so each new build installs over the last and keeps your alarms.

If the cache is ever lost, the next build gets a new key and Android will refuse to install it over the old
app ("App not installed"): uninstall the old app first (the alarms are stored in the app, so recreate them).
To make the key permanent, create your own and add it as repository secrets `ANDROID_KEYSTORE_BASE64`
(`base64 -w0 my.jks`) and `ANDROID_KEYSTORE_PASSWORD` (alias `sideload`, same key password); the workflow
prefers them. A local build without the key is signed with the standard Android debug key.
