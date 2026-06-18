/*
 * audio.js — the sound system (WebAudio synth, no files).
 *
 * Every sound is generated in code at runtime — retro chiptune blips and a
 * light looping backing track. No downloads, no licences to track, no
 * dependencies (this is the AUDIO-GUIDE's "Route 2 — generate custom retro
 * sounds", done programmatically).
 *
 * The engine calls Sound.play('jump' | 'bank' | 'win' | …) on events; game.js
 * starts the music and wires the mute button. Browsers block audio until the
 * user interacts, so the context is created/resumed on the first gesture.
 */

const Sound = (() => {
  let ctx = null;
  let master = null;
  let muted = false;
  let musicOn = false;
  let musicTimer = null;
  let step = 0;
  let currentTrack = 'grid'; // which TRACK is playing
  let savedTrack = null;     // track to restore after a conversation

  try { muted = localStorage.getItem('nza-muted') === '1'; } catch (e) {}

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
    return ctx;
  }

  // Call on a user gesture so audio is allowed to start.
  function unlock() {
    const c = ensure();
    if (c && c.state === 'suspended') c.resume();
  }

  // One enveloped oscillator note.
  function tone({ type = 'square', f0, f1, dur = 0.12, gain = 0.3, delay = 0 }) {
    const c = ensure();
    if (!c || muted) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  // Short burst of filtered noise (impacts).
  function noise(dur = 0.15, gain = 0.22) {
    const c = ensure();
    if (!c || muted) return;
    const n = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, n, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = c.createBufferSource();
    const g = c.createGain();
    src.buffer = buf; g.gain.value = gain;
    src.connect(g); g.connect(master);
    src.start();
  }

  // A quick arpeggio (powerup / win flourishes).
  function arp(notes, type = 'square', stepSec = 0.08, gain = 0.25) {
    notes.forEach((f, i) => tone({ type, f0: f, f1: f, dur: stepSec * 1.5, gain, delay: i * stepSec }));
  }

  const SFX = {
    jump:             () => tone({ type: 'square', f0: 380, f1: 760, dur: 0.12, gain: 0.22 }),
    'collect-soft':   () => tone({ type: 'triangle', f0: 660, f1: 990, dur: 0.12, gain: 0.26 }),
    'collect-bright': () => tone({ type: 'triangle', f0: 880, f1: 1320, dur: 0.12, gain: 0.26 }),
    'collect-low':    () => tone({ type: 'square', f0: 300, f1: 210, dur: 0.14, gain: 0.22 }),
    bank:             () => arp([660, 990], 'triangle', 0.07, 0.26),
    curtail:          () => tone({ type: 'sawtooth', f0: 300, f1: 130, dur: 0.18, gain: 0.18 }),
    surge:            () => tone({ type: 'sawtooth', f0: 200, f1: 920, dur: 0.4, gain: 0.2 }),
    powerup:          () => arp([523, 659, 784, 1047], 'square', 0.08, 0.22),
    shield:           () => tone({ type: 'sine', f0: 480, f1: 720, dur: 0.26, gain: 0.2 }),
    drain:            () => tone({ type: 'sawtooth', f0: 440, f1: 120, dur: 0.2, gain: 0.18 }),
    break:            () => { noise(0.09, 0.2); tone({ type: 'square', f0: 200, f1: 90, dur: 0.1, gain: 0.18 }); },
    spring:           () => tone({ type: 'sine', f0: 320, f1: 920, dur: 0.16, gain: 0.22 }),
    hit:              () => { noise(0.1, 0.2); tone({ type: 'sawtooth', f0: 260, f1: 130, dur: 0.14, gain: 0.18 }); },
    lose:             () => { noise(0.13, 0.22); arp([330, 233, 165], 'square', 0.1, 0.2); },
    win:              () => arp([523, 659, 784, 1047, 1319], 'square', 0.11, 0.25),
    click:            () => tone({ type: 'square', f0: 600, f1: 600, dur: 0.04, gain: 0.15 }),
    // a soft "someone's here" two-note chime when a character walks in to talk
    talk:             () => arp([587, 440], 'triangle', 0.1, 0.18),
  };

  function play(name) {
    unlock();
    const fn = SFX[name];
    if (fn) fn();
  }

  // ---- Music: looping chiptunes, one per context. Each TRACK has its own
  // tempo, waveforms and lead/bass note patterns (0 = rest). All generated in
  // code — no files. Pass a track name to startMusic(); the talk motif swaps in
  // while a conversation is on screen and the previous track resumes after.
  const TRACKS = {
    // Menu / hub / opening — calm, hopeful, unhurried (major arpeggios).
    menu: {
      tempo: 215, leadType: 'triangle', leadGain: 0.06, bassType: 'sine', bassGain: 0.05,
      lead: [523, 0, 659, 0, 784, 0, 659, 0, 587, 0, 698, 0, 587, 0, 0, 0],
      bass: [131, 0, 196, 0, 147, 0, 196, 0],
    },
    // World 1 "Power Up the Grid" — driving, upbeat chiptune.
    grid: {
      tempo: 155, leadType: 'square', leadGain: 0.06, bassType: 'triangle', bassGain: 0.07,
      lead: [392, 0, 523, 0, 659, 587, 523, 0, 440, 0, 523, 0, 587, 0, 494, 0],
      bass: [98, 131, 165, 131, 110, 147, 165, 147],
    },
    // Conversation — gentle, sparse, warm (replaces the old heartbeat pulse).
    talk: {
      tempo: 250, leadType: 'sine', leadGain: 0.06, bassType: 'sine', bassGain: 0.045,
      lead: [659, 0, 0, 587, 0, 0, 523, 0, 0, 587, 0, 0, 494, 0, 440, 0],
      bass: [147, 0, 0, 0, 165, 0, 0, 0],
    },
  };

  function musicTick() {
    if (muted || !musicOn) { step++; return; }
    const tk = TRACKS[currentTrack] || TRACKS.grid;
    const lead = tk.lead[step % tk.lead.length];
    if (lead) tone({ type: tk.leadType, f0: lead, f1: lead, dur: 0.18, gain: tk.leadGain });
    if (step % 2 === 0) {
      const b = tk.bass[(step / 2) % tk.bass.length];
      if (b) tone({ type: tk.bassType, f0: b, f1: b, dur: 0.24, gain: tk.bassGain });
    }
    step++;
  }

  function runTimer() {
    if (musicTimer) clearInterval(musicTimer);
    musicTimer = setInterval(musicTick, (TRACKS[currentTrack] || TRACKS.grid).tempo);
  }

  // startMusic(name): start (or switch to) the named track. Called per level.
  function startMusic(name) {
    unlock();
    currentTrack = (name && TRACKS[name]) ? name : 'grid';
    savedTrack = null;
    musicOn = true; step = 0;
    runTimer();
  }

  function stopMusic() {
    musicOn = false;
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  }

  function setMuted(m) {
    muted = m;
    try { localStorage.setItem('nza-muted', m ? '1' : '0'); } catch (e) {}
    if (master) master.gain.value = m ? 0 : 0.5;
  }

  // While a conversation is on screen, swap to the gentle "talk" motif, then
  // resume the level's track when it ends.
  function setDialogue(on) {
    if (!musicOn) return;
    if (on) {
      if (currentTrack === 'talk') return;
      savedTrack = currentTrack;
      currentTrack = 'talk';
    } else {
      if (currentTrack !== 'talk') return;
      currentTrack = savedTrack || 'grid';
      savedTrack = null;
    }
    step = 0;
    runTimer();
  }

  return {
    play, unlock, startMusic, stopMusic, setDialogue,
    toggleMute: () => { setMuted(!muted); return muted; },
    isMuted: () => muted,
  };
})();
