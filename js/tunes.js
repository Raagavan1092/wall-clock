// Twenty built-in alarm tunes, made in the browser (Web Audio) - no sound
// files to ship, load or cache.
//
// A tune is data: a scale, a tonic, a tempo and a few voices, each voice an
// instrument plus a string of notes. Notes are scale DEGREES, not pitches, so
// everything is in key by construction:
//
//   "0:1 2:.5 r:.5 4+6:2"   degree 0 for one beat, degree 2 for half a beat,
//                           half a beat's rest, then a chord of degrees 4 and 6
//                           for two beats.
//
// Degree 0 is the tonic; degrees past the end of the scale climb an octave
// (in a 7-note scale 7 is the tonic an octave up), negative ones descend. A
// voice's `octave` shifts it whole octaves and `delay` starts it that many
// beats late (that is how the canon enters). One pass of the tune is `beats`
// long; passes repeat until stopped. Voices that run past the end of a pass
// overlap the start of the next, so the canon's entries stay continuous.
//
// Apart from the Pachelbel canon (17th century) and Beethoven's Ode to Joy,
// the tunes are original compositions, in ragas where the name says so.
(function (global) {
  "use strict";

  const VedicEngine = global.VedicEngine = global.VedicEngine || {};

  // ---- scales (semitones above the tonic) -------------------------------------
  const MAJOR = [0, 2, 4, 5, 7, 9, 11];
  const BHOOPALI = [0, 2, 4, 7, 9];             // also Mohanam
  const AHIR_BHAIRAV = [0, 1, 4, 5, 7, 9, 10];
  const YAMAN = [0, 2, 4, 6, 7, 9, 11];         // Lydian
  const HAMSADHWANI = [0, 2, 4, 7, 11];
  const MADHUVANTI = [0, 2, 3, 6, 7, 9, 11];
  const BHAIRAV = [0, 1, 4, 5, 7, 8, 11];
  const MINOR_PENTATONIC = [0, 3, 5, 7, 10];

  function rep(text, times) { return new Array(times + 1).join(text + " "); }

  // MIDI numbers for tonics: 55 G3, 57 A3, 60 C4, 62 D4, 65 F4, 67 G4, 69 A4, 72 C5.
  const TUNES = [
    {
      id: "morning-canon", name: "Morning Canon", sub: "The Pachelbel canon theme, three voices entering in turn",
      scale: MAJOR, tonic: 62, bpm: 72, beats: 32, vol: 0.92,
      voices: [
        // the ground: D A B F# G D G A, twice
        { inst: "harp", vol: 0.9, octave: -2, notes: rep("0:2 4:2 5:2 2:2 3:2 0:2 3:2 4:2", 2) },
        { inst: "pad", vol: 0.5, octave: -1, notes: rep("0+2+4:2 4+6+8:2 5+7+9:2 2+4+6:2 3+5+7:2 0+2+4:2 3+5+7:2 4+6+8:2", 2) },
        // the theme, then its variation; the canon enters two bars later each time
        { inst: "musicbox", vol: 0.8, octave: 0, notes: "9:2 8:2 7:2 6:2 5:2 4:2 5:2 6:2 7:2 6:2 5:2 4:2 3:2 2:2 3:2 1:2" },
        { inst: "flute", vol: 0.75, octave: -1, delay: 8, notes: "9:2 8:2 7:2 6:2 5:2 4:2 5:2 6:2 7:2 6:2 5:2 4:2 3:2 2:2 3:2 1:2" },
        { inst: "harp", vol: 0.55, octave: 0, delay: 16, notes: "9:2 8:2 7:2 6:2 5:2 4:2 5:2 6:2 7:2 6:2 5:2 4:2 3:2 2:2 3:2 1:2" },
      ],
    },
    {
      id: "joyful-morning", name: "Joyful Morning", sub: "Ode to Joy on marimba, with a harp underneath",
      scale: MAJOR, tonic: 60, bpm: 100, beats: 32, vol: 1.62,
      voices: [
        { inst: "marimba", vol: 1, notes: "2:1 2:1 3:1 4:1 4:1 3:1 2:1 1:1 0:1 0:1 1:1 2:1 2:1.5 1:.5 1:2 2:1 2:1 3:1 4:1 4:1 3:1 2:1 1:1 0:1 0:1 1:1 2:1 1:1.5 0:.5 0:2" },
        { inst: "harp", vol: 0.6, octave: -1, notes: rep("0:1 2:1 4:1 2:1 4:1 6:1 8:1 6:1", 3) + "0:4 0:4" },
        { inst: "pad", vol: 0.35, octave: -1, notes: "0+2+4:8 4+6+8:8 0+2+4:8 4+6+8:4 0+2+4:4" },
      ],
    },
    {
      id: "bhoopali-dawn", name: "Bhoopali Dawn", sub: "Raga Bhoopali · flute over a tanpura drone",
      scale: BHOOPALI, tonic: 62, bpm: 58, beats: 32, vol: 0.68,
      voices: [
        { inst: "pad", vol: 0.45, notes: "-5+-2:16 -5+-2:16" },
        { inst: "flute", vol: 1, notes: "0:2 1:1 2:1 3:2 2:1 1:1 2:2 3:1 4:1 5:2 4:1 3:1 4:1 3:1 2:1 1:1 2:2 0:2 r:1 0:1 1:1 2:1 1:2 0:2" },
        { inst: "harp", vol: 0.5, notes: rep("-5:1 -3:1 -2:1 0:1 -2:1 -3:1 -5:2", 4) },
      ],
    },
    {
      id: "ahir-bhairav-sunrise", name: "Ahir Bhairav Sunrise", sub: "Raga Ahir Bhairav · plucked strings and a long flute",
      scale: AHIR_BHAIRAV, tonic: 60, bpm: 66, beats: 32, vol: 1.14,
      voices: [
        { inst: "pad", vol: 0.4, notes: "-7+-3:16 -7+-3:16" },
        { inst: "sitar", vol: 1, notes: "0:1 1:1 2:2 1:1 0:1 -1:2 0:1 2:1 3:1 4:1 3:2 2:2 4:1 5:1 6:1 7:1 6:1 5:1 4:2 3:1 2:1 1:1 0:1 -1:1 0:1 0:2" },
        { inst: "flute", vol: 0.55, notes: "0:4 2:4 4:4 2:4 3:4 2:4 1:4 0:4" },
      ],
    },
    {
      id: "yaman-glow", name: "Yaman Glow", sub: "Raga Yaman · rising harp over warm chords",
      scale: YAMAN, tonic: 60, bpm: 60, beats: 32, vol: 1.78,
      voices: [
        { inst: "harp", vol: 1, notes: "0:1 2:1 4:1 6:2 4:1 2:1 0:1 2:1 4:1 6:1 8:2 6:1 4:1 2:1 4:1 6:1 8:1 9:2 8:1 6:1 4:1 6:1 4:1 2:1 0:2 -1:1 0:2" },
        { inst: "pad", vol: 0.5, octave: -1, notes: "0+2+4:8 2+4+6:8 4+6+8:8 0+2+4:8" },
      ],
    },
    {
      id: "hamsadhwani-chimes", name: "Hamsadhwani Chimes", sub: "Raga Hamsadhwani · bright temple bells",
      scale: HAMSADHWANI, tonic: 67, bpm: 72, beats: 32, vol: 1.51,
      voices: [
        { inst: "bell", vol: 1, notes: "0:2 2:1 3:1 4:2 3:1 2:1 3:2 4:1 5:1 7:2 5:1 4:1 5:1 4:1 3:1 2:1 3:2 2:2 2:1 0:1 -1:2 0:4" },
        { inst: "harp", vol: 0.6, octave: -1, notes: rep("0:1 3:1 5:1 3:1", 8) },
      ],
    },
    {
      id: "madhuvanti-breeze", name: "Madhuvanti Breeze", sub: "Raga Madhuvanti · a soft afternoon flute",
      scale: MADHUVANTI, tonic: 62, bpm: 70, beats: 32, vol: 0.71,
      voices: [
        { inst: "flute", vol: 1, notes: "4:1 3:1 2:1 1:1 0:2 1:1 2:1 3:2 4:1 5:1 6:2 5:1 4:1 7:1 6:1 5:1 4:1 3:1 2:1 1:1 0:1 2:1 1:1 0:2 r:2 0:2" },
        { inst: "harp", vol: 0.65, octave: -1, notes: rep("0:1 3:1 4:1 3:1", 8) },
      ],
    },
    {
      id: "mohanam-garland", name: "Mohanam Garland", sub: "Raga Mohanam · a playful marimba dance",
      scale: BHOOPALI, tonic: 65, bpm: 84, beats: 32, vol: 1.96,
      voices: [
        { inst: "marimba", vol: 1, notes: "0:.5 1:.5 2:1 3:1 4:1 3:.5 2:.5 1:1 0:2 2:.5 3:.5 4:1 5:1 6:1 5:.5 4:.5 3:1 2:2 4:.5 5:.5 6:1 7:1 8:1 7:.5 6:.5 5:1 4:2 5:1 4:1 3:1 2:1 1:1 2:1 0:2" },
        { inst: "harp", vol: 0.6, octave: -1, notes: rep("0:2 2:2 3:2 2:2", 4) },
      ],
    },
    {
      id: "bhairav-prayer", name: "Bhairav Prayer", sub: "Raga Bhairav · slow, with a deep drone and bell",
      scale: BHAIRAV, tonic: 62, bpm: 52, beats: 32, vol: 0.68,
      voices: [
        { inst: "pad", vol: 0.45, notes: "-7+-3:32" },
        { inst: "flute", vol: 1, notes: "0:3 1:1 2:2 1:1 0:1 4:3 3:1 2:2 1:1 0:1 5:2 4:2 3:2 2:2 1:2 -1:2 0:4" },
        { inst: "bell", vol: 0.55, notes: rep("0:8", 4) },
      ],
    },
    {
      id: "bilaval-morning", name: "Bilaval Morning", sub: "Bright and cheerful · marimba and harp",
      scale: MAJOR, tonic: 60, bpm: 108, beats: 32, vol: 1.49,
      voices: [
        { inst: "marimba", vol: 1, notes: "4:1 2:1 4:1 7:1 6:1 4:1 6:1 8:1 7:1 5:1 7:1 9:1 8:1 7:1 5:1 3:1 4:1 2:1 4:1 7:1 6:1 8:1 9:1 8:1 7:1 5:1 3:1 5:1 4:1 2:1 0:2" },
        { inst: "harp", vol: 0.7, octave: -1, notes: "0:1 2:1 4:1 2:1 4:1 6:1 8:1 6:1 5:1 7:1 9:1 7:1 3:1 5:1 7:1 5:1 0:1 2:1 4:1 2:1 4:1 6:1 8:1 6:1 3:1 5:1 7:1 5:1 0:1 2:1 4:1 2:1" },
      ],
    },
    {
      id: "temple-bell-rounds", name: "Temple Bell Rounds", sub: "Bells chasing each other, round after round",
      scale: BHOOPALI, tonic: 60, bpm: 60, beats: 24, vol: 1.5,
      voices: [
        { inst: "bell", vol: 1, notes: "0:2 2:2 4:2 3:2 2:2 0:2 -2:2 0:2 2:2 4:2 2:2 3:2" },
        { inst: "bell", vol: 0.7, octave: 1, delay: 6, notes: "0:2 2:2 4:2 3:2 2:2 0:2 -2:2 0:2 2:2 4:2 2:2 3:2" },
        { inst: "pad", vol: 0.35, notes: "-5+-2:24" },
      ],
    },
    {
      id: "sunrise-arpeggios", name: "Sunrise Arpeggios", sub: "Harp arpeggios rising with the light",
      scale: MAJOR, tonic: 60, bpm: 80, beats: 32, vol: 1.16,
      voices: [
        { inst: "harp", vol: 1, notes:
          "0:.5 2:.5 4:.5 7:.5 9:.5 7:.5 4:.5 2:.5 " + "3:.5 5:.5 7:.5 10:.5 12:.5 10:.5 7:.5 5:.5 " +
          "5:.5 7:.5 9:.5 12:.5 14:.5 12:.5 9:.5 7:.5 " + "4:.5 6:.5 8:.5 11:.5 13:.5 11:.5 8:.5 6:.5 " +
          "0:.5 2:.5 4:.5 7:.5 9:.5 7:.5 4:.5 2:.5 " + "3:.5 5:.5 7:.5 10:.5 12:.5 10:.5 7:.5 5:.5 " +
          "4:.5 6:.5 8:.5 11:.5 13:.5 11:.5 8:.5 6:.5 " + "0:.5 2:.5 4:.5 7:.5 9:.5 7:.5 4:.5 2:.5" },
        { inst: "pad", vol: 0.45, octave: -1, notes: "0+2+4:4 3+5+7:4 5+7+9:4 4+6+8:4 0+2+4:4 3+5+7:4 4+6+8:4 0+2+4:4" },
        { inst: "bell", vol: 0.5, octave: 1, notes: "0:16 4:16" },
      ],
    },
    {
      id: "lotus-lullaby", name: "Lotus Lullaby", sub: "A gentle waltz on a music box",
      scale: BHOOPALI, tonic: 65, bpm: 66, beats: 24, vol: 1.81,
      voices: [
        { inst: "musicbox", vol: 1, notes: "2:1 3:1 4:1 3:2 2:1 1:1 2:1 3:1 2:3 4:1 5:1 6:1 5:2 4:1 3:1 2:1 1:1 0:3" },
        { inst: "harp", vol: 0.6, octave: -1, notes: rep("0:1 2+3:1 2+3:1", 8) },
      ],
    },
    {
      id: "river-flute", name: "River Flute", sub: "A slow pentatonic flute over a low drone",
      scale: MINOR_PENTATONIC, tonic: 62, bpm: 56, beats: 32, vol: 0.68,
      voices: [
        { inst: "pad", vol: 0.4, notes: "-5+-2:32" },
        { inst: "flute", vol: 1, notes: "0:3 2:1 3:2 2:1 1:1 0:2 1:2 2:2 1:2 3:3 4:1 5:2 4:1 3:1 2:2 3:1 2:1 1:2 0:2" },
      ],
    },
    {
      id: "marimba-morning", name: "Marimba Morning", sub: "A bouncing, upbeat marimba line",
      scale: MAJOR, tonic: 62, bpm: 120, beats: 32, vol: 1.54,
      voices: [
        { inst: "marimba", vol: 1, notes:
          "0:.5 2:.5 4:1 2:.5 4:.5 7:1 " + "6:.5 4:.5 2:1 4:.5 6:.5 8:1 " + "7:.5 5:.5 3:1 5:.5 7:.5 9:1 " + "8:1 7:1 4:1 2:1 " +
          "0:.5 2:.5 4:1 2:.5 4:.5 7:1 " + "6:.5 8:.5 9:1 8:.5 6:.5 4:1 " + "5:.5 4:.5 3:1 2:.5 3:.5 5:1 " + "4:1 2:1 0:2" },
        { inst: "harp", vol: 0.6, octave: -1, notes: rep("0:2 4:2", 8) },
      ],
    },
    {
      id: "dawn-chimes", name: "Dawn Chimes", sub: "High chimes cascading over a pad",
      scale: YAMAN, tonic: 72, bpm: 60, beats: 32, vol: 1.75,
      voices: [
        { inst: "bell", vol: 0.9, notes: "0:1 2:1 4:1 6:1 7:2 4:1 2:1 2:1 4:1 6:1 7:1 9:2 6:1 4:1 4:1 6:1 7:1 9:1 11:2 9:1 7:1 6:1 4:1 2:1 0:1 -1:2 0:2" },
        { inst: "pad", vol: 0.5, octave: -2, notes: "0+4:16 2+6:16" },
      ],
    },
    {
      id: "crystal-music-box", name: "Crystal Music Box", sub: "A sparkling nursery-style melody",
      scale: MAJOR, tonic: 69, bpm: 96, beats: 32, vol: 1.81,
      voices: [
        { inst: "musicbox", vol: 1, notes: "4:1 4:1 5:1 4:1 3:2 2:2 2:1 3:1 2:1 1:1 0:4 4:1 4:1 5:1 7:1 6:2 5:2 4:1 3:1 2:1 1:1 0:4" },
        { inst: "harp", vol: 0.6, octave: -1, notes: "0:1 2:1 4:1 2:1 0:1 2:1 4:1 2:1 4:1 6:1 8:1 6:1 0:1 2:1 4:1 2:1 0:1 2:1 4:1 2:1 0:1 2:1 4:1 2:1 4:1 6:1 8:1 6:1 0:1 2:1 4:1 2:1" },
      ],
    },
    {
      id: "golden-hour-waltz", name: "Golden Hour Waltz", sub: "A warm waltz, flute over plucked chords",
      scale: MAJOR, tonic: 62, bpm: 110, beats: 24, vol: 0.64,
      voices: [
        { inst: "flute", vol: 1, notes: "4:2 5:1 7:2 6:1 5:1 6:1 7:1 9:3 8:2 7:1 6:2 5:1 4:1 5:1 3:1 0:3" },
        { inst: "harp", vol: 0.75, notes:
          "-7:1 -5+-3:1 -5+-3:1 " + "-4:1 -2+0:1 -2+0:1 " + "-3:1 -1+1:1 -1+1:1 " + "-7:1 -5+-3:1 -5+-3:1 " +
          "-4:1 -2+0:1 -2+0:1 " + "-3:1 -1+1:1 -1+1:1 " + "-4:1 -2+0:1 -2+0:1 " + "-7:1 -5+-3:1 -5+-3:1" },
      ],
    },
    {
      id: "mountain-pad", name: "Mountain Pad", sub: "Slow, spacious chords with a distant bell",
      scale: BHOOPALI, tonic: 57, bpm: 50, beats: 32, vol: 1.86,
      voices: [
        { inst: "pad", vol: 0.8, notes: "0+2+3:8 -1+0+2:8 1+3+5:8 0+2+3:8" },
        { inst: "bell", vol: 0.5, octave: 1, notes: "2:4 r:4 4:4 r:4 3:4 r:4 2:4 r:4" },
      ],
    },
    {
      id: "rise-and-shine", name: "Rise and Shine", sub: "A quick, bright fanfare - the hardest to sleep through",
      scale: MAJOR, tonic: 72, bpm: 132, beats: 16, vol: 1.11,
      voices: [
        { inst: "marimba", vol: 1, notes:
          "0:.5 2:.5 4:.5 7:1.5 4:.5 2:.5 " + "4:.5 7:.5 9:.5 11:1.5 9:.5 7:.5 " + "9:.5 7:.5 5:.5 4:1.5 2:.5 4:.5 " + "5:.5 4:.5 2:.5 0:1.5 r:1" },
        { inst: "bell", vol: 0.7, notes: "7:4 4:4 5:4 7:4" },
        { inst: "harp", vol: 0.7, octave: -1, notes: rep("0:1 4:1", 8) },
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
  // Each takes (ctx, out, freq, when, seconds, volume) and plays one note.

  function partials(ctx, out, f, t, list, volume, type) {
    list.forEach(function (p) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type || "sine";
      osc.frequency.value = f * p[0];
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(volume * p[1], t + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + p[2]);
      osc.connect(gain).connect(out);
      osc.start(t);
      osc.stop(t + p[2] + 0.05);
    });
  }

  const INSTRUMENTS = {
    bell: function (ctx, out, f, t, d, v) {
      partials(ctx, out, f, t, [[0.5, 0.35, 3.5], [1, 1, 3], [1.19, 0.35, 2.2], [1.5, 0.3, 1.8], [2, 0.28, 1.5], [2.74, 0.15, 0.9], [3.76, 0.08, 0.5]], v * 0.2);
    },
    harp: function (ctx, out, f, t, d, v) {
      partials(ctx, out, f, t, [[1, 1, 1.9], [2, 0.32, 1.1], [3, 0.14, 0.65], [4, 0.06, 0.4]], v * 0.24);
    },
    musicbox: function (ctx, out, f, t, d, v) {
      partials(ctx, out, f, t, [[1, 1, 1.5], [3.01, 0.22, 0.55], [6.2, 0.07, 0.25]], v * 0.2);
    },
    marimba: function (ctx, out, f, t, d, v) {
      partials(ctx, out, f, t, [[1, 1, 0.6], [4, 0.22, 0.14], [10, 0.06, 0.05]], v * 0.3);
    },
    // A plucked string with a bright start that mellows: sawtooth through a falling low-pass.
    sitar: function (ctx, out, f, t, d, v) {
      [0, 7].forEach(function (cents) {
        const osc = ctx.createOscillator();
        const filter = ctx.createBiquadFilter();
        const gain = ctx.createGain();
        osc.type = "sawtooth";
        osc.frequency.value = f;
        osc.detune.value = cents;
        filter.type = "lowpass";
        filter.Q.value = 2;
        filter.frequency.setValueAtTime(Math.min(f * 8, 9000), t);
        filter.frequency.exponentialRampToValueAtTime(Math.max(f * 1.5, 300), t + 0.5);
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.linearRampToValueAtTime(v * 0.12, t + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
        osc.connect(filter).connect(gain).connect(out);
        osc.start(t);
        osc.stop(t + 1.6);
      });
    },
    // A breathy sustained tone with a little vibrato that arrives after the attack.
    flute: function (ctx, out, f, t, d, v) {
      const end = t + Math.max(d, 0.25);
      const osc = ctx.createOscillator();
      const second = ctx.createOscillator();
      const vibrato = ctx.createOscillator();
      const vibratoDepth = ctx.createGain();
      const gain = ctx.createGain();
      const secondGain = ctx.createGain();
      osc.frequency.value = f;
      second.frequency.value = f * 2;
      secondGain.gain.value = 0.12;
      vibrato.frequency.value = 5;
      vibratoDepth.gain.setValueAtTime(0, t);
      vibratoDepth.gain.linearRampToValueAtTime(f * 0.006, t + 0.4);
      vibrato.connect(vibratoDepth);
      vibratoDepth.connect(osc.frequency);
      vibratoDepth.connect(second.frequency);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(v * 0.26, t + 0.09);
      gain.gain.setValueAtTime(v * 0.26, Math.max(t + 0.1, end - 0.12));
      gain.gain.linearRampToValueAtTime(0.0001, end + 0.12);
      osc.connect(gain);
      second.connect(secondGain).connect(gain);
      gain.connect(out);
      [osc, second, vibrato].forEach(function (o) { o.start(t); o.stop(end + 0.2); });
    },
    // Two slightly detuned saws, softened, swelling in and out.
    pad: function (ctx, out, f, t, d, v) {
      const end = t + Math.max(d, 0.5);
      const attack = Math.min(0.6, d * 0.3);
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      filter.type = "lowpass";
      filter.frequency.value = Math.min(f * 3, 1400);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(v * 0.07, t + attack);
      gain.gain.setValueAtTime(v * 0.07, Math.max(t + attack, end - 0.5));
      gain.gain.linearRampToValueAtTime(0.0001, end + 0.4);
      [-6, 6].forEach(function (cents) {
        const osc = ctx.createOscillator();
        osc.type = "sawtooth";
        osc.frequency.value = f;
        osc.detune.value = cents;
        osc.connect(filter);
        osc.start(t);
        osc.stop(end + 0.5);
      });
      filter.connect(gain).connect(out);
    },
  };

  // Schedules one pass of `tune` into `out`, starting at `t0` (seconds on `ctx`'s clock).
  // Works on any BaseAudioContext, so tests can render it offline.
  function schedulePass(ctx, out, tune, t0) {
    const beat = 60 / tune.bpm;
    tune.voices.forEach(function (voice) {
      const play = INSTRUMENTS[voice.inst];
      parseVoice(voice).forEach(function (ev) {
        ev.degrees.forEach(function (degree) {
          play(ctx, out, frequency(tune, degree, voice.octave), t0 + ev.start * beat, ev.beats * beat, (voice.vol == null ? 1 : voice.vol) * tune.vol);
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
