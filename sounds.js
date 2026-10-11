/* ============================================================
   RUNE MATCH — AUDIO ENGINE
   ============================================================ */

const Audio = (function () {
  let ctx = null;
  let musicOn = true;
  let musicStarted = false;
  let soundOn = true;
  let musicNodes = [];

  function init() {
    try {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        ctx = new AC();
      }
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    } catch (e) { return false; }
  }

  function tone(freq, duration, type, volume, delay) {
    type = type || 'sine';
    volume = volume || 0.15;
    delay = delay || 0;
    if (!soundOn) return;
    try {
      if (!init()) return;
      const start = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(volume, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + duration + 0.05);
    } catch (e) {}
  }

  function sweep(startFreq, endFreq, duration, type, volume, delay) {
    type = type || 'sine';
    volume = volume || 0.15;
    delay = delay || 0;
    if (!soundOn) return;
    try {
      if (!init()) return;
      const start = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(startFreq, start);
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), start + duration);
      gain.gain.setValueAtTime(volume, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + duration + 0.05);
    } catch (e) {}
  }

  function sfxClick() { tone(880, 0.05, 'sine', 0.12); tone(1320, 0.04, 'sine', 0.06, 0.03); }
  function sfxAnswer() { tone(660, 0.06, 'triangle', 0.1); tone(990, 0.05, 'triangle', 0.05, 0.03); }
  function sfxCorrect() {
    tone(660, 0.1, 'sine', 0.15, 0);
    tone(880, 0.12, 'sine', 0.13, 0.08);
    tone(1174, 0.15, 'sine', 0.12, 0.16);
  }
  function sfxWrong() {
    tone(280, 0.1, 'sawtooth', 0.15, 0);
    tone(200, 0.15, 'sawtooth', 0.13, 0.08);
    tone(140, 0.2, 'sawtooth', 0.1, 0.16);
  }
  function sfxSelect() { tone(1046, 0.06, 'sine', 0.1); }
  function sfxSwap() {
    tone(440, 0.08, 'sine', 0.12);
    tone(660, 0.08, 'sine', 0.12, 0.06);
  }
  function sfxMatch(size) {
    // Bigger matches get richer chords
    if (size >= 5) {
      [523, 659, 784, 1047, 1318].forEach(function (f, i) {
        tone(f, 0.15, 'sine', 0.14, i * 0.05);
      });
    } else if (size === 4) {
      [523, 659, 784].forEach(function (f, i) {
        tone(f, 0.14, 'sine', 0.13, i * 0.06);
      });
    } else {
      [523, 659].forEach(function (f, i) {
        tone(f, 0.12, 'sine', 0.12, i * 0.06);
      });
    }
  }
  function sfxCascade(level) {
    // Rising pitch per cascade level
    const baseFreq = 784 + (level * 100);
    tone(baseFreq, 0.1, 'sine', 0.13);
    tone(baseFreq * 1.25, 0.12, 'sine', 0.12, 0.08);
  }
  function sfxNoMatch() {
    tone(220, 0.15, 'sawtooth', 0.1);
    tone(180, 0.2, 'sawtooth', 0.08, 0.1);
  }
  function sfxShuffle() {
    for (let i = 0; i < 6; i++) {
      tone(400 + i * 80, 0.03, 'sine', 0.06, i * 0.03);
    }
  }
  function sfxLevelWin() {
    [523, 659, 784, 1047, 1318].forEach(function (f, i) {
      tone(f, 0.22, 'sine', 0.18, i * 0.1);
    });
    tone(1568, 0.5, 'sine', 0.16, 0.55);
    tone(2093, 0.6, 'sine', 0.12, 0.7);
  }
  function sfxLevelLose() {
    tone(392, 0.25, 'sine', 0.15, 0);
    tone(330, 0.25, 'sine', 0.15, 0.2);
    tone(262, 0.4, 'sine', 0.15, 0.4);
    tone(196, 0.6, 'sine', 0.14, 0.65);
  }
  function sfxVictory() {
    [523, 659, 784, 1047, 1318, 1568, 2093].forEach(function (f, i) {
      tone(f, 0.3, 'sine', 0.16, i * 0.13);
    });
    tone(2637, 0.8, 'sine', 0.14, 0.9);
    tone(3136, 1.0, 'sine', 0.1, 1.1);
  }
  function sfxReset() {
    sweep(600, 200, 0.4, 'sawtooth', 0.15, 0);
    tone(300, 0.3, 'triangle', 0.1, 0.3);
  }

  /* ---------- MUSIC (Mystic ambient loop) ---------- */
  function startMusic() {
    if (!musicOn || musicStarted) return;
    try { if (!init()) return; } catch (e) { return; }
    try {
      // Ambient pad
      [130.81, 174.61, 220].forEach(function (freq) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();
        osc.type = 'sine';
        osc.frequency.value = freq;
        filter.type = 'lowpass';
        filter.frequency.value = 500;
        gain.gain.value = 0;
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        gain.gain.linearRampToValueAtTime(0.025, ctx.currentTime + 4);
        musicNodes.push({ osc: osc, gain: gain });
      });
      // Meditative melody
      const notes = [392, 466.16, 523.25, 622.25, 523.25, 466.16, 392, 349.23];
      let idx = 0;
      musicNodes.melodyInterval = setInterval(function () {
        if (!musicOn || !ctx) return;
        try {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.value = notes[idx % notes.length];
          gain.gain.setValueAtTime(0, ctx.currentTime);
          gain.gain.linearRampToValueAtTime(0.04, ctx.currentTime + 0.8);
          gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 3);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + 3.1);
          idx++;
        } catch (e) {}
      }, 2600);
      musicStarted = true;
    } catch (e) { musicStarted = false; }
  }
  function stopMusic() {
    try {
      musicNodes.forEach(function (n) {
        try {
          if (n.gain) n.gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 1);
          if (n.osc) setTimeout(function () { try { n.osc.stop(); } catch (e) {} }, 1200);
        } catch (e) {}
      });
      if (musicNodes.melodyInterval) clearInterval(musicNodes.melodyInterval);
      musicNodes = [];
      musicStarted = false;
    } catch (e) {}
  }
  function toggleMusic() {
    musicOn = !musicOn;
    if (musicOn) startMusic(); else stopMusic();
    sfxClick();
    return musicOn;
  }
  function unlock() {
    init();
    if (musicOn) startMusic();
  }

  return {
    unlock: unlock,
    toggleMusic: toggleMusic,
    startMusic: startMusic,
    stopMusic: stopMusic,
    sfxClick: sfxClick,
    sfxAnswer: sfxAnswer,
    sfxCorrect: sfxCorrect,
    sfxWrong: sfxWrong,
    sfxSelect: sfxSelect,
    sfxSwap: sfxSwap,
    sfxMatch: sfxMatch,
    sfxCascade: sfxCascade,
    sfxNoMatch: sfxNoMatch,
    sfxShuffle: sfxShuffle,
    sfxLevelWin: sfxLevelWin,
    sfxLevelLose: sfxLevelLose,
    sfxVictory: sfxVictory,
    sfxReset: sfxReset
  };
})();