// Twenty built-in wake-up tunes, made in the browser (Web Audio) - no sound
// files to ship, load or cache. They are meant to jolt you awake, not to
// soothe: drums, bass, sirens, brass, chip leads, in twenty different styles
// (marching band, funk, techno, drum & bass, ska, dubstep, trap, polka ...).
//
// A tune is data: a scale, a tonic, a tempo and a few voices, each voice an
// instrument plus a string of notes. Notes are scale DEGREES, not pitches, so
// pitched parts are in key by construction:
//
//   "0:1 2:.5 r:.5 4+6:2"   degree 0 for one beat, degree 2 for half a beat,
//                           half a beat's rest, then a chord of degrees 4 and 6
//                           for two beats.
//
// Degree 0 is the tonic; degrees past the end of the scale climb an octave
// (in a 7-note scale 7 is the tonic an octave up), negative ones descend. A
// voice's `octave` shifts it whole octaves and `delay` starts it that many
// beats late. Drum voices (kick, snare, hat ...) ignore pitch: any degree just
// means "hit". One pass of the tune is `beats` long; passes repeat until
// stopped, and every voice's notes add up to exactly `beats`.
//
// All twenty are original.
(function (global) {
  "use strict";

  const VedicEngine = global.VedicEngine = global.VedicEngine || {};

  // ---- scales (semitones above the tonic) -------------------------------------
  const MAJOR = [0, 2, 4, 5, 7, 9, 11];
  const MINOR = [0, 2, 3, 5, 7, 8, 10];
  const MINOR_PENTATONIC = [0, 3, 5, 7, 10];
  const MIXOLYDIAN = [0, 2, 4, 5, 7, 9, 10];
  const TRITONE = [0, 6];                      // a root and the devil's interval: an alarm's two notes
  const TWO_BELLS = [0, 1];                    // two bells a semitone apart, for the clock trill

  function rep(text, times) { return new Array(times + 1).join(text + " "); }
  // A 16th-note bass figure on `root`, jumping up `up` degrees: one bar.
  function pump(root, up) {
    const half = root + ":.25 " + root + ":.25 " + (root + up) + ":.25 " + root + ":.25 " + root + ":.25 " + (root + up) + ":.25 " + root + ":.25 " + (root + up) + ":.25 ";
    return half + half;
  }
  // A galloping 8th + two 16ths, on `what` (a degree or chord), for `bars` bars.
  function gallop(what, bars) { return rep(what + ":.5 " + what + ":.25 " + what + ":.25", 4 * bars); }

  // Common drum bars (4 beats each).
  const FLOOR = "0:1 0:1 0:1 0:1 ";                        // kick on every beat
  const BACKBEAT = "r:1 0:1 r:1 0:1 ";                     // on beats 2 and 4
  const EIGHTHS = rep("0:.5", 8) + " ";                    // eight 8ths
  const OFFBEATS = rep("r:.5 0:.5", 4) + " ";              // the "and" of every beat
  const SIXTEENTHS = rep("0:.25", 16) + " ";

  // MIDI numbers for tonics: 45 A2, 52 E3, 57 A3, 60 C4, 62 D4, 64 E4, 67 G4, 69 A4.
  const TUNES = [
    {
      id: "reveille-rush", name: "Reveille Rush", sub: "A brass bugle fanfare over snare rolls - up, soldier",
      scale: MAJOR, tonic: 60, bpm: 140, beats: 16, vol: 1.034,
      voices: [
        { inst: "brass", vol: 1, notes: "0:.5 0:.5 2:.5 4:1.5 2:.5 4:.5 7:1 7:.5 4:.5 2:1 4:1 0:.5 0:.5 2:.5 4:1.5 2:.5 4:.5 7:.5 9:.5 11:1 9:1 7:1" },
        { inst: "snare", vol: 1, notes: BACKBEAT + rep("0:.25", 16) + BACKBEAT + rep("0:.25", 16) },
        { inst: "kick", vol: 1, notes: rep("0:1 r:1", 8) },
        { inst: "hat", vol: 0.8, notes: rep("0:.5", 32) },
      ],
    },
    {
      id: "chiptune-charge", name: "Chiptune Charge", sub: "8-bit square-wave arpeggios, full speed",
      scale: MINOR, tonic: 69, bpm: 150, beats: 16, vol: 0.569,
      voices: [
        { inst: "square", vol: 0.8, notes: rep("0:.25 2:.25 4:.25 7:.25", 4) + rep("5:.25 7:.25 9:.25 12:.25", 4) + rep("2:.25 4:.25 6:.25 9:.25", 4) + rep("6:.25 8:.25 10:.25 13:.25", 4) },
        { inst: "square", vol: 1, octave: 1, notes: "9:1 11:.5 9:.5 7:1 9:1 12:1 11:.5 9:.5 7:1 5:1 9:.5 11:.5 13:1 11:1 9:1 13:1 12:.5 11:.5 10:2" },
        { inst: "tri", vol: 1, octave: -2, notes: rep("0:.5", 8) + rep("5:.5", 8) + rep("2:.5", 8) + rep("6:.5", 8) },
        { inst: "kick", vol: 1, notes: rep("0:1 r:1", 8) },
        { inst: "snare", vol: 0.8, notes: rep(BACKBEAT, 4) },
        { inst: "hat", vol: 0.7, notes: rep(EIGHTHS, 4) },
      ],
    },
    {
      id: "funk-alarm", name: "Funk Alarm", sub: "A slapping, syncopated bass line with tight chord stabs",
      scale: MINOR_PENTATONIC, tonic: 64, bpm: 108, beats: 16, vol: 0.766,
      voices: [
        { inst: "bassPluck", vol: 1, octave: -2, notes: rep("0:.5 r:.25 0:.25 3:.5 r:.5 2:.5 0:.25 r:.25 4:.5 r:.5", 3) + "0:.5 r:.25 0:.25 3:.5 r:.5 4:.5 3:.25 r:.25 2:.5 r:.5" },
        { inst: "stab", vol: 1, notes: rep("r:.5 0+3+4:.25 r:.75 0+3+4:.25 r:.5 0+3+4:.25 r:1.5", 4) },
        { inst: "kick", vol: 1, notes: rep("0:1 r:.5 0:.5 r:1 0:.5 r:.5", 4) },
        { inst: "snare", vol: 0.9, notes: rep(BACKBEAT, 4) },
        { inst: "hat", vol: 0.8, notes: rep(SIXTEENTHS, 4) },
      ],
    },
    {
      id: "siren-sprint", name: "Siren Sprint", sub: "An emergency-vehicle wail over a pounding kick",
      scale: MINOR, tonic: 69, bpm: 128, beats: 16, vol: 0.302,
      voices: [
        { inst: "siren", vol: 1, notes: rep("7:1 3:1", 8) },
        { inst: "bassSub", vol: 1, octave: -2, notes: rep("0:.5", 32) },
        { inst: "kick", vol: 1, notes: rep(FLOOR, 4) },
        { inst: "snare", vol: 0.9, notes: rep(BACKBEAT, 4) },
        { inst: "hat", vol: 0.8, notes: rep(OFFBEATS, 4) },
      ],
    },
    {
      id: "ska-shake", name: "Ska Shake", sub: "Off-beat chops, a walking bass and a cheeky brass line",
      scale: MAJOR, tonic: 60, bpm: 165, beats: 16, vol: 0.945,
      voices: [
        { inst: "stab", vol: 1, notes: rep("r:.5 0+2+4:.5", 4) + rep("r:.5 3+5+7:.5", 4) + rep("r:.5 0+2+4:.5", 4) + rep("r:.5 4+6+8:.5", 4) },
        { inst: "bassPluck", vol: 1, octave: -2, notes: "0:1 2:1 4:1 2:1 3:1 5:1 7:1 5:1 0:1 2:1 4:1 2:1 4:1 6:1 8:1 6:1" },
        { inst: "brass", vol: 0.9, notes: "7:.5 9:.5 11:1 9:.5 7:.5 9:1 10:.5 9:.5 7:1 5:.5 7:.5 9:1 7:.5 9:.5 11:1 9:.5 7:.5 4:1 6:.5 8:.5 9:1 8:.5 6:.5 4:1" },
        { inst: "kick", vol: 1, notes: rep("0:1 r:1", 8) },
        { inst: "snare", vol: 0.8, notes: rep(BACKBEAT, 4) },
        { inst: "hat", vol: 0.7, notes: rep(EIGHTHS, 4) },
      ],
    },
    {
      id: "techno-pulse", name: "Techno Pulse", sub: "Four-on-the-floor with a squelching acid bass",
      scale: MINOR, tonic: 57, bpm: 135, beats: 16, vol: 1.003,
      voices: [
        { inst: "kick", vol: 1, notes: rep(FLOOR, 4) },
        { inst: "hat", vol: 0.9, notes: rep(OFFBEATS, 4) },
        { inst: "clap", vol: 1, notes: rep(BACKBEAT, 4) },
        { inst: "acid", vol: 1, octave: -1, notes: rep("0:.25 0:.25 r:.25 0:.25 3:.25 r:.25 0:.25 0:.25 7:.25 r:.25 0:.25 3:.25 0:.25 r:.25 5:.25 0:.25", 4) },
        { inst: "stab", vol: 0.8, notes: rep("r:1.5 0+2+4:.5 r:2", 4) },
      ],
    },
    {
      id: "drum-rampage", name: "Drum Rampage", sub: "Drum and bass at 174 - breakbeats and a rolling sub",
      scale: MINOR_PENTATONIC, tonic: 64, bpm: 174, beats: 16, vol: 0.347,
      voices: [
        { inst: "kick", vol: 1, notes: rep("0:1 r:1.5 0:.5 r:1", 4) },
        { inst: "snare", vol: 1, notes: rep(BACKBEAT, 4) },
        { inst: "hat", vol: 0.8, notes: rep(SIXTEENTHS, 4) },
        { inst: "bassSub", vol: 1, octave: -2, notes: "0:2 3:1 0:1 0:2 5:1 3:1 0:2 3:1 0:1 3:2 2:1 0:1" },
        { inst: "stab", vol: 0.9, notes: rep("r:.75 0+3+4:.25 r:1.75 0+3+4:.25 r:1", 4) },
      ],
    },
    {
      id: "rock-riff-wake", name: "Rock Riff Wake", sub: "Chugging power chords, a scream of a lead, a stomping beat",
      scale: MINOR_PENTATONIC, tonic: 52, bpm: 132, beats: 16, vol: 1.123,
      voices: [
        { inst: "stab", vol: 1, notes: rep("0+3:.5 0+3:.5 r:.5 0+3:.5 r:.5 0+3:.5 2+5:.5 r:.5", 3) + "0+3:.5 0+3:.5 r:.5 0+3:.5 r:.5 0+3:.5 4+7:.5 r:.5" },
        { inst: "saw", vol: 0.9, octave: 1, notes: "r:4 7:.5 6:.5 5:1 3:1 5:1 r:4 8:.5 7:.5 6:1 5:1 3:1" },
        { inst: "bassPluck", vol: 1, octave: -2, notes: rep("0:.5", 32) },
        { inst: "kick", vol: 1, notes: rep("0:1 r:.5 0:.5 0:1 r:1", 4) },
        { inst: "snare", vol: 1, notes: rep(BACKBEAT, 4) },
        { inst: "hat", vol: 0.8, notes: rep(EIGHTHS, 4) },
      ],
    },
    {
      id: "marching-band", name: "Marching Band", sub: "A snare cadence, thumping bass drum and a jaunty brass tune",
      scale: MAJOR, tonic: 60, bpm: 120, beats: 16, vol: 0.86,
      voices: [
        { inst: "snare", vol: 1, notes: rep("0:.5 0:.25 0:.25 0:.5 0:.5 0:.5 0:.25 0:.25 0:.5 0:.5", 4) },
        { inst: "kick", vol: 1, notes: rep("0:1 r:1", 8) },
        { inst: "brass", vol: 1, notes: "4:1 4:.5 4:.5 7:1 4:1 9:1 7:.5 5:.5 4:2 5:1 5:.5 5:.5 9:1 7:1 7:1 4:.5 2:.5 0:2" },
        { inst: "bassPluck", vol: 1, octave: -2, notes: "0:1 4:1 0:1 4:1 0:1 4:1 0:1 4:1 3:1 7:1 3:1 7:1 4:1 7:1 0:2" },
        { inst: "hat", vol: 0.7, notes: rep(OFFBEATS, 4) },
      ],
    },
    {
      id: "disco-sunrise", name: "Disco Sunrise", sub: "Octave-jumping bass, open hats and a punchy horn riff",
      scale: MINOR, tonic: 57, bpm: 120, beats: 16, vol: 0.851,
      voices: [
        { inst: "kick", vol: 1, notes: rep(FLOOR, 4) },
        { inst: "openhat", vol: 1, notes: rep(OFFBEATS, 4) },
        { inst: "clap", vol: 0.9, notes: rep(BACKBEAT, 4) },
        { inst: "bassPluck", vol: 1, octave: -1, notes: rep("0:.5 7:.5", 8) + rep("5:.5 12:.5", 4) + rep("6:.5 13:.5", 4) },
        { inst: "stab", vol: 0.8, notes: rep("r:.5 0+2+4:.5", 8) + rep("r:.5 5+7+9:.5", 4) + rep("r:.5 6+8+10:.5", 4) },
        { inst: "brass", vol: 0.9, notes: "7:.5 9:.5 11:.5 9:.5 7:1 r:1 7:.5 9:.5 11:.5 12:.5 11:1 r:1 12:.5 11:.5 9:.5 7:.5 9:1 r:1 10:.5 9:.5 8:.5 6:.5 7:1 r:1" },
      ],
    },
    {
      id: "dubstep-drop", name: "Dubstep Drop", sub: "A growling, wobbling bass over half-time drums",
      scale: MINOR, tonic: 57, bpm: 140, beats: 16, vol: 0.716,
      voices: [
        { inst: "wobble", vol: 1, octave: -2, notes: "0:4 0:2 3:2 5:3 3:1 0:4" },
        { inst: "kick", vol: 1, notes: rep("0:1 r:1.5 0:.5 r:1", 4) },
        { inst: "snare", vol: 1, notes: rep("r:2 0:1 r:1", 4) },
        { inst: "hat", vol: 0.8, notes: rep(EIGHTHS, 4) },
        { inst: "saw", vol: 0.7, octave: 1, notes: rep("7:.5 r:3.5", 4) },
      ],
    },
    {
      id: "trap-alarm", name: "Trap Alarm", sub: "Booming 808s, stuttering hi-hats and a pinging bell",
      scale: MINOR, tonic: 57, bpm: 140, beats: 16, vol: 0.393,
      voices: [
        { inst: "bassSub", vol: 1, octave: -2, notes: rep("0:1.5 r:.5 0:.5 r:.5 3:1 0:1.5 r:.5 5:1 3:1", 2) },
        { inst: "clap", vol: 1, notes: rep("r:2 0:1 r:1", 4) },
        { inst: "hat", vol: 0.9, notes: rep("0:.5 0:.5 0:.5 0:.25 0:.25 0:.5 0:.25 0:.25 0:.25 0:.25 0:.5", 4) },
        { inst: "clockbell", vol: 0.8, octave: 1, notes: rep("7:.5 r:.5 10:.5 r:.5 7:.5 r:.5 8:1", 4) },
      ],
    },
    {
      id: "synthwave-sprint", name: "Synthwave Sprint", sub: "A racing 80s arpeggio bass and a neon lead",
      scale: MINOR, tonic: 57, bpm: 120, beats: 16, vol: 1.188,
      voices: [
        { inst: "saw", vol: 0.8, octave: -1, notes: pump(0, 7) + pump(5, 7) + pump(2, 7) + pump(6, 7) },
        { inst: "pad", vol: 0.8, notes: "0+2+4:4 5+7+9:4 2+4+6:4 6+8+10:4" },
        { inst: "saw", vol: 1, octave: 1, notes: "0:1 2:.5 4:.5 5:2 5:1 4:1 2:1 0:1 2:1 4:1 6:2 6:.5 5:.5 4:1 3:2" },
        { inst: "kick", vol: 1, notes: rep("0:1 r:1", 8) },
        { inst: "snare", vol: 1, notes: rep(BACKBEAT, 4) },
      ],
    },
    {
      id: "polka-pounce", name: "Polka Pounce", sub: "An oom-pah-pah stomp with a cheerful brass tune",
      scale: MAJOR, tonic: 60, bpm: 152, beats: 16, vol: 0.907,
      voices: [
        { inst: "bassPluck", vol: 1, octave: -2, notes: "0:1 r:1 0:1 r:1 4:1 r:1 4:1 r:1 0:1 r:1 3:1 r:1 4:1 r:1 0:1 r:1" },
        { inst: "stab", vol: 1, notes: "r:1 0+2+4:1 r:1 0+2+4:1 r:1 4+6+8:1 r:1 4+6+8:1 r:1 0+2+4:1 r:1 3+5+7:1 r:1 4+6+8:1 r:1 0+2+4:1" },
        { inst: "brass", vol: 1, notes: "7:.5 7:.5 9:.5 7:.5 4:1 7:1 6:.5 6:.5 8:.5 6:.5 4:1 6:1 7:.5 9:.5 11:.5 9:.5 10:.5 9:.5 7:1 8:.5 6:.5 4:1 7:2" },
        { inst: "kick", vol: 1, notes: rep("0:1 r:1", 8) },
        { inst: "snare", vol: 0.9, notes: rep("r:1 0:1", 8) },
      ],
    },
    {
      id: "cowbell-gallop", name: "Cowbell Gallop", sub: "A galloping guitar riff and unrelenting cowbell",
      scale: MINOR_PENTATONIC, tonic: 52, bpm: 135, beats: 16, vol: 0.742,
      voices: [
        { inst: "stab", vol: 1, notes: gallop("0+3", 2) + gallop("1+4", 1) + gallop("2+5", 1) },
        { inst: "bassPluck", vol: 1, octave: -2, notes: gallop("0", 2) + gallop("1", 1) + gallop("2", 1) },
        { inst: "cowbell", vol: 1, notes: rep("0:1", 16) },
        { inst: "kick", vol: 1, notes: rep("0:.5 0:.25 0:.25", 16) },
        { inst: "snare", vol: 1, notes: rep(BACKBEAT, 4) },
      ],
    },
    {
      id: "samba-shock", name: "Samba Shock", sub: "Surdo, shakers, cowbell and a piercing whistle",
      scale: MIXOLYDIAN, tonic: 62, bpm: 104, beats: 16, vol: 0.798,
      voices: [
        { inst: "kick", vol: 1, notes: rep(BACKBEAT, 4) },
        { inst: "cowbell", vol: 0.9, notes: rep("0:.75 0:.75 0:.5 0:.75 0:.75 0:.5", 4) },
        { inst: "hat", vol: 0.8, notes: rep(SIXTEENTHS, 4) },
        { inst: "bassPluck", vol: 1, octave: -2, notes: rep("0:1.5 r:.5 4:1 r:.5 0:.5", 4) },
        { inst: "whistle", vol: 1, octave: 2, notes: rep("r:3 0:.25 0:.25 0:.5", 4) },
        { inst: "tom", vol: 0.9, notes: rep("r:2 0:.5 2:.5 4:.5 3:.5", 4) },
      ],
    },
    {
      id: "boing-boing", name: "Boing Boing", sub: "Springy cartoon bounces - impossible to stay lying down",
      scale: MAJOR, tonic: 67, bpm: 140, beats: 16, vol: 0.781,
      voices: [
        { inst: "boing", vol: 1, notes: "0:.5 4:.5 7:.5 4:.5 9:.5 7:.5 4:.5 2:.5 0:.5 5:.5 9:.5 5:.5 7:.5 4:.5 2:.5 0:.5 2:.5 5:.5 9:.5 5:.5 11:.5 9:.5 7:.5 4:.5 0:.5 4:.5 7:.5 11:.5 14:1 r:1" },
        { inst: "bassPluck", vol: 1, octave: -1, notes: rep("0:1 r:.5 0:.5 4:1 r:1", 4) },
        { inst: "kick", vol: 1, notes: rep("0:1 r:1", 8) },
        { inst: "clap", vol: 1, notes: rep(BACKBEAT, 4) },
        { inst: "hat", vol: 0.7, notes: rep(OFFBEATS, 4) },
      ],
    },
    {
      id: "klaxon-beat", name: "Klaxon Beat", sub: "A harsh industrial horn over a relentless machine beat",
      scale: TRITONE, tonic: 45, bpm: 120, beats: 16, vol: 0.335,
      voices: [
        { inst: "klaxon", vol: 1, octave: 1, notes: rep("0:.75 1:.75 0:.75 1:.75 r:1", 4) },
        { inst: "bassSub", vol: 1, octave: -1, notes: rep("0:.5", 32) },
        { inst: "kick", vol: 1, notes: rep(FLOOR, 4) },
        { inst: "snare", vol: 1, notes: rep(BACKBEAT, 4) },
        { inst: "hat", vol: 0.8, notes: rep(SIXTEENTHS, 4) },
      ],
    },
    {
      id: "old-alarm-clock", name: "Old Alarm Clock", sub: "The classic twin-bell hammer: rrrring... rrrring...",
      scale: TWO_BELLS, tonic: 93, bpm: 120, beats: 16, vol: 1.513,
      voices: [
        { inst: "clockbell", vol: 1, notes: rep(rep("0:.125 1:.125", 12) + "r:1", 4) },
      ],
    },
    {
      id: "wake-up-jump", name: "Wake-Up Jump", sub: "Pumping eurodance chords, a bright hook and claps",
      scale: MINOR, tonic: 62, bpm: 140, beats: 16, vol: 0.338,
      voices: [
        { inst: "kick", vol: 1, notes: rep(FLOOR, 4) },
        { inst: "clap", vol: 1, notes: rep(BACKBEAT, 4) },
        { inst: "hat", vol: 0.8, notes: rep(OFFBEATS, 4) },
        { inst: "stab", vol: 1, notes: rep("r:.5 0+2+4:.5", 4) + rep("r:.5 5+7+9:.5", 4) + rep("r:.5 2+4+6:.5", 4) + rep("r:.5 6+8+10:.5", 4) },
        { inst: "bassSub", vol: 1, octave: -2, notes: rep("0:.5", 8) + rep("5:.5", 8) + rep("2:.5", 8) + rep("6:.5", 8) },
        { inst: "saw", vol: 0.9, octave: 1, notes: "7:.5 7:.5 9:.5 11:.5 12:1 11:1 12:.5 12:.5 11:.5 9:.5 7:2 9:.5 9:.5 11:.5 13:.5 14:1 13:1 14:.5 13:.5 12:.5 11:.5 9:1 7:1" },
      ],
    },
  ];

  const BY_ID = {};
  TUNES.forEach(function (t) { BY_ID[t.id] = t; });

  // ---- parsing ------------------------------------------------------------------

  const parsed = new Map();
  // [{ start, beats, degrees: [..] }] for one voice (degrees empty for a rest).
  function parseVoice(voice) {
    if (parsed.has(voice)) return parsed.get(voice);
    const events = [];
    let at = (voice.delay || 0);
    voice.notes.trim().split(/\s+/).forEach(function (token) {
      const parts = token.split(":");
      const beats = parseFloat(parts[1]);
      if (!isFinite(beats) || beats <= 0) throw new Error("Bad tune note: " + token);
      const degrees = parts[0] === "r" ? [] : parts[0].split("+").map(function (d) {
        const n = parseInt(d, 10);
        if (!isFinite(n)) throw new Error("Bad tune note: " + token);
        return n;
      });
      events.push({ start: at, beats: beats, degrees: degrees });
      at += beats;
    });
    parsed.set(voice, events);
    return events;
  }

  function frequency(tune, degree, octave) {
    const n = tune.scale.length;
    const d = degree + (octave || 0) * n;
    const oct = Math.floor(d / n);
    const midi = tune.tonic + 12 * oct + tune.scale[((d % n) + n) % n];
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  // ---- instruments ----------------------------------------------------------------
  // Each takes (ctx, out, freq, when, seconds, volume, env) and plays one note
  // (`env.bpm` is the tune's tempo, for tempo-synced effects). Drums ignore freq.

  const noises = new WeakMap();
  function noiseBuffer(ctx) {
    let buf = noises.get(ctx);
    if (!buf) {
      buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = buf.getChannelData(0);
      // A fixed pseudo-random sequence, so every render of a tune is identical.
      let seed = 12345;
      for (let i = 0; i < data.length; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; data[i] = seed / 2147483648 - 1; }
      noises.set(ctx, buf);
    }
    return buf;
  }
  // A filtered burst of noise: the body of hats, snares and claps.
  function burst(ctx, out, t, seconds, type, freq, q, peak) {
    const src = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    src.buffer = noiseBuffer(ctx);
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    gain.gain.setValueAtTime(peak, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    src.connect(filter).connect(gain).connect(out);
    src.start(t);
    src.stop(t + seconds + 0.02);
  }
  // An oscillator with an attack, a hold and a release.
  function tone(ctx, out, type, f, t, hold, peak, attack, release, filterFreq) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = f;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(peak, t + attack);
    gain.gain.setValueAtTime(peak, t + Math.max(attack, hold));
    gain.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(attack, hold) + release);
    let node = osc;
    if (filterFreq) {
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = filterFreq;
      osc.connect(filter);
      node = filter;
    }
    node.connect(gain).connect(out);
    osc.start(t);
    osc.stop(t + Math.max(attack, hold) + release + 0.02);
    return osc;
  }
  function partials(ctx, out, f, t, list, volume) {
    list.forEach(function (p) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = f * p[0];
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(volume * p[1], t + 0.002);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + p[2]);
      osc.connect(gain).connect(out);
      osc.start(t);
      osc.stop(t + p[2] + 0.03);
    });
  }

  const INSTRUMENTS = {
    // ---- drums
    kick: function (ctx, out, f, t, d, v) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.setValueAtTime(165, t);
      osc.frequency.exponentialRampToValueAtTime(48, t + 0.12);
      gain.gain.setValueAtTime(v * 0.65, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      osc.connect(gain).connect(out);
      osc.start(t);
      osc.stop(t + 0.32);
    },
    snare: function (ctx, out, f, t, d, v) {
      burst(ctx, out, t, 0.17, "bandpass", 2000, 0.7, v * 0.4);
      tone(ctx, out, "triangle", 185, t, 0.02, v * 0.25, 0.002, 0.08);
    },
    hat: function (ctx, out, f, t, d, v) { burst(ctx, out, t, 0.045, "highpass", 7500, 0.5, v * 0.16); },
    openhat: function (ctx, out, f, t, d, v) { burst(ctx, out, t, 0.24, "highpass", 6500, 0.5, v * 0.14); },
    clap: function (ctx, out, f, t, d, v) {
      [0, 0.011, 0.022].forEach(function (dt) { burst(ctx, out, t + dt, 0.03, "bandpass", 1400, 1, v * 0.3); });
      burst(ctx, out, t + 0.03, 0.16, "bandpass", 1400, 1, v * 0.18);
    },
    tom: function (ctx, out, f, t, d, v) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.setValueAtTime(f * 1.5, t);
      osc.frequency.exponentialRampToValueAtTime(f, t + 0.08);
      gain.gain.setValueAtTime(v * 0.6, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      osc.connect(gain).connect(out);
      osc.start(t);
      osc.stop(t + 0.3);
    },
    cowbell: function (ctx, out, f, t, d, v) {
      [560, 845].forEach(function (hz) {
        const osc = ctx.createOscillator();
        const filter = ctx.createBiquadFilter();
        const gain = ctx.createGain();
        osc.type = "square";
        osc.frequency.value = hz;
        filter.type = "bandpass";
        filter.frequency.value = 800;
        filter.Q.value = 3;
        gain.gain.setValueAtTime(v * 0.16, t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
        osc.connect(filter).connect(gain).connect(out);
        osc.start(t);
        osc.stop(t + 0.25);
      });
    },

    // ---- bass
    bassPluck: function (ctx, out, f, t, d, v) {
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      const len = Math.min(d * 0.95, 0.6);
      osc.type = "sawtooth";
      osc.frequency.value = f;
      filter.type = "lowpass";
      filter.Q.value = 4;
      filter.frequency.setValueAtTime(1800, t);
      filter.frequency.exponentialRampToValueAtTime(250, t + 0.12);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(v * 0.45, t + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.08);
      osc.connect(filter).connect(gain).connect(out);
      osc.start(t);
      osc.stop(t + len + 0.1);
    },
    bassSub: function (ctx, out, f, t, d, v) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(f * 1.4, t);
      osc.frequency.exponentialRampToValueAtTime(f, t + 0.04);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(v * 0.6, t + 0.004);
      gain.gain.setValueAtTime(v * 0.6, t + d * 0.85);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + d * 0.85 + 0.07);
      osc.connect(gain).connect(out);
      osc.start(t);
      osc.stop(t + d * 0.85 + 0.09);
      tone(ctx, out, "sawtooth", f, t, d * 0.8, v * 0.06, 0.004, 0.05, 400);
    },
    acid: function (ctx, out, f, t, d, v) {
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.value = f;
      filter.type = "lowpass";
      filter.Q.value = 14;
      filter.frequency.setValueAtTime(Math.min(f * 12, 6000), t);
      filter.frequency.exponentialRampToValueAtTime(f * 2, t + d * 0.9);
      gain.gain.setValueAtTime(v * 0.3, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + d * 0.95);
      osc.connect(filter).connect(gain).connect(out);
      osc.start(t);
      osc.stop(t + d);
    },
    // A saw bass whose filter is swept by a tempo-synced LFO: the dubstep "wub".
    wobble: function (ctx, out, f, t, d, v, env) {
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.value = f;
      filter.type = "lowpass";
      filter.Q.value = 9;
      filter.frequency.value = 1100;
      lfo.frequency.value = env.bpm / 60 * 2; // eighth-note wobble
      depth.gain.value = 950;
      lfo.connect(depth).connect(filter.frequency);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(v * 0.34, t + 0.01);
      gain.gain.setValueAtTime(v * 0.34, t + d * 0.95);
      gain.gain.linearRampToValueAtTime(0.0001, t + d);
      osc.connect(filter).connect(gain).connect(out);
      osc.start(t);
      lfo.start(t);
      osc.stop(t + d + 0.02);
      lfo.stop(t + d + 0.02);
    },
    tri: function (ctx, out, f, t, d, v) { tone(ctx, out, "triangle", f, t, d * 0.9, v * 0.4, 0.003, 0.04); },

    // ---- leads and chords
    square: function (ctx, out, f, t, d, v) { tone(ctx, out, "square", f, t, d * 0.7, v * 0.1, 0.002, 0.04); },
    saw: function (ctx, out, f, t, d, v) { tone(ctx, out, "sawtooth", f, t, d * 0.85, v * 0.13, 0.004, 0.06, Math.min(f * 6, 6000)); },
    stab: function (ctx, out, f, t, d, v) {
      [-8, 8].forEach(function (cents) {
        const osc = tone(ctx, out, "sawtooth", f, t, Math.min(d * 0.7, 0.2), v * 0.07, 0.003, 0.07, 2600);
        osc.detune.value = cents;
      });
    },
    brass: function (ctx, out, f, t, d, v) {
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(f * 0.96, t);
      osc.frequency.exponentialRampToValueAtTime(f, t + 0.05);
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(500, t);
      filter.frequency.exponentialRampToValueAtTime(2600, t + 0.06);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(v * 0.17, t + 0.025);
      gain.gain.setValueAtTime(v * 0.17, t + d * 0.9);
      gain.gain.linearRampToValueAtTime(0.0001, t + d * 0.9 + 0.05);
      osc.connect(filter).connect(gain).connect(out);
      osc.start(t);
      osc.stop(t + d * 0.9 + 0.07);
    },
    pad: function (ctx, out, f, t, d, v) {
      const end = t + Math.max(d, 0.5);
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      filter.type = "lowpass";
      filter.frequency.value = Math.min(f * 3, 1400);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(v * 0.07, t + Math.min(0.4, d * 0.3));
      gain.gain.setValueAtTime(v * 0.07, Math.max(t + 0.4, end - 0.4));
      gain.gain.linearRampToValueAtTime(0.0001, end + 0.3);
      [-6, 6].forEach(function (cents) {
        const osc = ctx.createOscillator();
        osc.type = "sawtooth";
        osc.frequency.value = f;
        osc.detune.value = cents;
        osc.connect(filter);
        osc.start(t);
        osc.stop(end + 0.4);
      });
      filter.connect(gain).connect(out);
    },

    // ---- effects and characters
    // A wail that rises through each note, like a siren sweeping up.
    siren: function (ctx, out, f, t, d, v) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(f, t);
      osc.frequency.linearRampToValueAtTime(f * 1.18, t + d * 0.9);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(v * 0.32, t + 0.01);
      gain.gain.setValueAtTime(v * 0.32, t + d * 0.92);
      gain.gain.linearRampToValueAtTime(0.0001, t + d);
      osc.connect(gain).connect(out);
      osc.start(t);
      osc.stop(t + d + 0.02);
    },
    klaxon: function (ctx, out, f, t, d, v) {
      [-12, 12].forEach(function (cents) {
        const osc = tone(ctx, out, "square", f, t, d * 0.93, v * 0.1, 0.006, 0.03, 1800);
        osc.detune.value = cents;
      });
    },
    // A hard, bright bell: the clapper of an old alarm clock.
    clockbell: function (ctx, out, f, t, d, v) {
      partials(ctx, out, f, t, [[1, 1, 0.22], [2.76, 0.6, 0.16], [5.4, 0.35, 0.1]], v * 0.28);
    },
    whistle: function (ctx, out, f, t, d, v) {
      const vibrato = ctx.createOscillator();
      const depth = ctx.createGain();
      const osc = tone(ctx, out, "sine", f, t, d, v * 0.18, 0.01, 0.03);
      vibrato.frequency.value = 28;
      depth.gain.value = f * 0.01;
      vibrato.connect(depth).connect(osc.frequency);
      vibrato.start(t);
      vibrato.stop(t + d + 0.1);
    },
    boing: function (ctx, out, f, t, d, v) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(f * 0.55, t);
      osc.frequency.exponentialRampToValueAtTime(f, t + 0.045);
      osc.frequency.linearRampToValueAtTime(f * 0.97, t + 0.22);
      gain.gain.setValueAtTime(v * 0.45, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      osc.connect(gain).connect(out);
      osc.start(t);
      osc.stop(t + 0.37);
    },
  };

  // Schedules one pass of `tune` into `out`, starting at `t0` (seconds on `ctx`'s clock).
  // Works on any BaseAudioContext, so tests can render it offline.
  function schedulePass(ctx, out, tune, t0) {
    const beat = 60 / tune.bpm;
    const env = { bpm: tune.bpm };
    tune.voices.forEach(function (voice) {
      const play = INSTRUMENTS[voice.inst];
      if (!play) throw new Error("Unknown instrument: " + voice.inst);
      parseVoice(voice).forEach(function (ev) {
        ev.degrees.forEach(function (degree) {
          play(ctx, out, frequency(tune, degree, voice.octave), t0 + ev.start * beat, ev.beats * beat, (voice.vol == null ? 1 : voice.vol) * tune.vol, env);
        });
      });
    });
  }

  // ---- playback ----------------------------------------------------------------------

  let ac = null, master = null, current = null, passTimer = null, stopTimer = null;
  const listeners = [];

  function notify() { listeners.forEach(function (fn) { try { fn(current); } catch (e) { console.error(e); } }); }

  function context() {
    if (!ac) {
      const Ctor = global.AudioContext || global.webkitAudioContext;
      if (!Ctor) return null;
      try { ac = new Ctor(); } catch (e) { return null; }
    }
    if (ac.state === "suspended") ac.resume().catch(function () { /* needs a user gesture */ });
    return ac;
  }

  function stop() {
    clearTimeout(passTimer);
    clearTimeout(stopTimer);
    passTimer = stopTimer = null;
    if (master) {
      const fading = master;
      master = null;
      try { fading.gain.setTargetAtTime(0, ac.currentTime, 0.05); } catch (e) { /* ignore */ }
      setTimeout(function () { try { fading.disconnect(); } catch (e) { /* ignore */ } }, 400);
    }
    if (current !== null) { current = null; notify(); }
  }

  // Plays tune `id`, repeating, until stop() or `maxMs` (default 5 minutes).
  // Returns true if the browser let sound start (false while it still wants a tap).
  function start(id, options) {
    const tune = BY_ID[id];
    if (!tune) return false;
    stop();
    const c = context();
    if (!c) return false;
    const maxMs = (options && options.maxMs) || 5 * 60 * 1000;
    master = c.createGain();
    master.gain.value = 0.9;
    const limiter = c.createDynamicsCompressor();
    master.connect(limiter);
    limiter.connect(c.destination);
    const length = tune.beats * 60 / tune.bpm;
    let t0 = c.currentTime + 0.1;
    const mine = master;
    function pass() {
      if (master !== mine) return;
      schedulePass(c, mine, tune, t0);
      t0 += length;
      // Queue the next pass shortly before this one ends.
      passTimer = setTimeout(pass, Math.max(200, (t0 - c.currentTime - 1.5) * 1000));
    }
    current = id;
    pass();
    stopTimer = setTimeout(stop, maxMs);
    notify();
    return c.state === "running";
  }

  VedicEngine.Tunes = {
    list: TUNES.map(function (t) { return { id: t.id, name: t.name, sub: t.sub, bpm: t.bpm, beats: t.beats }; }),
    get: function (id) { return BY_ID[id] || null; },
    has: function (id) { return !!BY_ID[id]; },
    start: start,
    stop: stop,
    playing: function () { return current; },
    running: function () { return !!ac && ac.state === "running"; },
    unlock: function () { context(); },
    onChange: function (fn) { listeners.push(fn); return function () { const i = listeners.indexOf(fn); if (i !== -1) listeners.splice(i, 1); }; },
    schedulePass: schedulePass,
    frequency: frequency,
  };
})(typeof window !== "undefined" ? window : globalThis);
