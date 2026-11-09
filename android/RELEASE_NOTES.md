# Release notes

Each release's text is the section under `## <version>` matching `appVersion` in `app/build.gradle.kts`; CI puts it in the GitHub Release. Add a new section (newest first) whenever you bump the version.

## 1.2.1

- **One compact widget:** an icon-height strip (one cell tall) with a small clock face (ghaṭī hand and pala hand) and the ghaṭī, pala and time written beside it. Made short and not vertically resizable so lock screens that only offer 1×1 / 1×2 slots can list it. The hands are redrawn every minute, also with the app closed.
- **Phone layout:** the Location & time widget and the alarm list are now drop-downs under their buttons (tap elsewhere or Esc to close). In landscape the clock no longer drops below the screen, and the alarm list keeps "Set New Alarm" in view.
- **Ring buttons:** just an arrow with the next/previous ring name beneath it. Good / Bad times are round coloured check boxes at the clock's top corners.
- **Buttons:** the next-alarm chip is gone; "Find muhurta" and "Today Special" are the new labels; the Location widget now sits above these buttons.
- The page itself (layout, text) updates from the web without a new APK; this release carries the widget change.
