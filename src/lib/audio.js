//     SOUND PLAYER
export function playSound(type) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    if (type === "alarm") { osc.frequency.value = 880; gain.gain.value = 0.15; osc.start(); osc.stop(ctx.currentTime + 0.3); }
    else if (type === "complete") { osc.frequency.value = 523; gain.gain.value = 0.12; osc.start(); osc.stop(ctx.currentTime + 0.2); }
    else if (type === "levelup") { osc.frequency.value = 660; gain.gain.value = 0.15; osc.start(); osc.stop(ctx.currentTime + 0.5); }
    else if (type === "bell") { osc.type = "sine"; osc.frequency.value = 396; gain.gain.value = 0.08; gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 2); osc.start(); osc.stop(ctx.currentTime + 2); }
    else if (type === "countbeep") { osc.frequency.value = 600; gain.gain.value = 0.18; osc.start(); osc.stop(ctx.currentTime + 0.15); }
    else if (type === "countgo") { osc.frequency.value = 440; gain.gain.value = 0.22; gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5); osc.start(); osc.stop(ctx.currentTime + 0.5); }
  } catch(e) {}
}

//     AMBIENT AUDIO ENGINE
function createNoiseBuffer(ctx, type, seconds) {
  const sr = ctx.sampleRate;
  const len = sr * (seconds || 2);
  const buf = ctx.createBuffer(1, len, sr);
  const data = buf.getChannelData(0);
  if (type === "brown") {
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      data[i] = last * 3.5;
    }
  } else {
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }
  const source = ctx.createBufferSource();
  source.buffer = buf;
  source.loop = true;
  return source;
}

export class AmbientAudio {
  constructor() {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.ctx.destination);
    this.nodes = [];
    this.timers = [];
    this.volume = 0.5;
    this.muted = false;
    this.playing = false;
  }

  start(medTypeId, fadeIn) {
    this.ctx.resume();
    const builder = {
      breath: () => this._breathScape(),
      body_scan: () => this._bodyScanScape(),
      loving_kindness: () => this._lovingKindnessScape(),
      visualization: () => this._visualizationScape(),
      mindfulness: () => this._mindfulnessScape(),
      mantra: () => this._mantraScape(),
    }[medTypeId];
    if (builder) builder();
    this.playing = true;
    const target = this.muted ? 0 : this.volume;
    this.master.gain.setValueAtTime(0, this.ctx.currentTime);
    this.master.gain.linearRampToValueAtTime(target, this.ctx.currentTime + (fadeIn || 3));
  }

  stop(fadeOut) {
    if (!this.playing) return;
    this.playing = false;
    const fo = fadeOut || 3;
    this.master.gain.linearRampToValueAtTime(0, this.ctx.currentTime + fo);
    setTimeout(() => this.destroy(), fo * 1000 + 200);
  }

  setVolume(v) {
    this.volume = v;
    if (!this.muted && this.playing) {
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.linearRampToValueAtTime(v, this.ctx.currentTime + 0.1);
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.playing) {
      const target = this.muted ? 0 : this.volume;
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.linearRampToValueAtTime(target, this.ctx.currentTime + 0.2);
    }
    return this.muted;
  }

  destroy() {
    this.timers.forEach(t => clearTimeout(t));
    this.timers = [];
    this.nodes.forEach(n => { try { n.stop(); } catch(e) {} try { n.disconnect(); } catch(e) {} });
    this.nodes = [];
    try { this.master.disconnect(); } catch(e) {}
    try { this.ctx.close(); } catch(e) {}
  }

  _osc(type, freq, gain) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq; g.gain.value = gain;
    o.connect(g); g.connect(this.master);
    o.start(); this.nodes.push(o, g);
    return { osc: o, gain: g };
  }

  _noise(type, gain, filterType, filterFreq, filterQ) {
    const src = createNoiseBuffer(this.ctx, type, 2);
    const g = this.ctx.createGain();
    g.gain.value = gain;
    if (filterType) {
      const f = this.ctx.createBiquadFilter();
      f.type = filterType; f.frequency.value = filterFreq || 1000; if (filterQ) f.Q.value = filterQ;
      src.connect(f); f.connect(g); this.nodes.push(f);
    } else {
      src.connect(g);
    }
    g.connect(this.master);
    src.start(); this.nodes.push(src, g);
    return { source: src, gain: g };
  }

  // Breath Focus: deep oceanic drone
  _breathScape() {
    this._osc("sine", 60, 0.25);
    this._osc("sine", 120, 0.12);
    this._osc("sine", 180, 0.06);
    this._noise("brown", 0.10, "lowpass", 200);
  }

  // Body Scan: sweeping filtered noise
  _bodyScanScape() {
    const src = createNoiseBuffer(this.ctx, "white", 2);
    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass"; filter.frequency.value = 200; filter.Q.value = 5;
    const g = this.ctx.createGain(); g.gain.value = 0.18;
    src.connect(filter); filter.connect(g); g.connect(this.master);
    src.start(); this.nodes.push(src, filter, g);
    this._osc("sine", 174, 0.10);
    // Sweep filter between 200-800Hz
    const sweep = () => {
      const now = this.ctx.currentTime;
      filter.frequency.setValueAtTime(filter.frequency.value, now);
      const target = filter.frequency.value < 500 ? 800 : 200;
      filter.frequency.linearRampToValueAtTime(target, now + 20);
      this.timers.push(setTimeout(sweep, 20000));
    };
    sweep();
  }

  // Loving Kindness: warm major chord
  _lovingKindnessScape() {
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass"; filter.frequency.value = 600;
    filter.connect(this.master); this.nodes.push(filter);
    [[261.6, 3], [329.6, -3], [392.0, 2], [523.2, -2]].forEach(([freq, det], i) => {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = "sine"; o.frequency.value = freq; o.detune.value = det;
      g.gain.value = i < 3 ? 0.09 : 0.035;
      o.connect(g); g.connect(filter);
      o.start(); this.nodes.push(o, g);
    });
  }

  // Visualization: binaural beats + depth
  _visualizationScape() {
    // Left ear 200Hz
    const oL = this.ctx.createOscillator();
    const gL = this.ctx.createGain();
    const panL = this.ctx.createStereoPanner();
    oL.type = "sine"; oL.frequency.value = 200; gL.gain.value = 0.12; panL.pan.value = -1;
    oL.connect(gL); gL.connect(panL); panL.connect(this.master);
    oL.start(); this.nodes.push(oL, gL, panL);
    // Right ear 210Hz (10Hz alpha binaural)
    const oR = this.ctx.createOscillator();
    const gR = this.ctx.createGain();
    const panR = this.ctx.createStereoPanner();
    oR.type = "sine"; oR.frequency.value = 210; gR.gain.value = 0.12; panR.pan.value = 1;
    oR.connect(gR); gR.connect(panR); panR.connect(this.master);
    oR.start(); this.nodes.push(oR, gR, panR);
    // Brown noise pad
    this._noise("brown", 0.12, "lowpass", 400);
  }

  // Mindfulness: rain-like texture
  _mindfulnessScape() {
    // High rain hiss
    const n1 = this._noise("white", 0.07, "highpass", 1000);
    // Drizzle texture
    this._noise("white", 0.05, "bandpass", 3000, 1);
    // LFO for gentle ebb and flow on rain
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.type = "sine"; lfo.frequency.value = 0.15;
    lfoGain.gain.value = 0.01;
    lfo.connect(lfoGain); lfoGain.connect(n1.gain.gain);
    lfo.start(); this.nodes.push(lfo, lfoGain);
  }

  // Mantra: singing bowl resonance
  _mantraScape() {
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.type = "sine"; lfo.frequency.value = 0.08; lfoGain.gain.value = 0.015;
    lfo.connect(lfoGain); lfo.start(); this.nodes.push(lfo, lfoGain);
    [[ 396, 0.10 ], [ 793, 0.05 ], [ 1188, 0.025 ]].forEach(([freq, vol]) => {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = "sine"; o.frequency.value = freq; g.gain.value = vol;
      o.connect(g); g.connect(this.master);
      lfoGain.connect(g.gain);
      o.start(); this.nodes.push(o, g);
    });
  }
}
