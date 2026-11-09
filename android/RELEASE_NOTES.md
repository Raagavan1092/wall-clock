# Release notes

Each release's text is the section under `## <version>` matching `appVersion` in `app/build.gradle.kts`; CI puts it in the GitHub Release. Add a new section (newest first) whenever you bump the version.

## 1.2.1

Adds a 2x2 Panchanga widget (ghaṭī and pala, time, tithi and nakṣatra with their end times) beside the compact clock widget. Tapping a ring segment now shows a small card that always stays on screen.

- **Panchanga widget (2x2):** ghaṭī · pala, the hour and minute, the tithi and when it ends, the nakṣatra and when it ends. Updates every minute with the app closed.
- **Compact clock widget:** an icon-height strip (one cell tall) with a small clock face (ghaṭī hand and pala hand) and the ghaṭī, pala and time beside it.
- **Segment info:** tap a ring segment to see its details in a small card that opens where there is room and never runs off the screen. Tap anywhere else to close it. Swiping across the clock no longer switches rings; use the arrows.
- **Phone layout:** the Location & time widget and the alarm list are drop-downs under their buttons. In landscape the clock no longer drops below the screen, and the alarm list keeps "Set New Alarm" in view.
- **Buttons:** ring buttons are an arrow with the ring name below; Good / Bad times are round coloured check boxes at the clock's top corners; "Find muhurta" and "Today Special" are the new labels.
- **Updates:** the update dialog shows a short plain message, and the APK is named after its version.
