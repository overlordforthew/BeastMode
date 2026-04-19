#!/usr/bin/env node

// Generates three short alarm WAV files for Android notification channels.
// Output: android/app/src/main/res/raw/beastmode_{classic,bell,siren}.wav
// 16-bit PCM, 44100 Hz, mono.

const fs = require("fs");
const path = require("path");

const SAMPLE_RATE = 44100;
const OUT_DIR = path.join(__dirname, "..", "android", "app", "src", "main", "res", "raw");

function writeWav(filename, samples) {
  const bytesPerSample = 2;
  const byteLength = samples.length * bytesPerSample;
  const buffer = Buffer.alloc(44 + byteLength);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + byteLength, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * bytesPerSample, 28);
  buffer.writeUInt16LE(bytesPerSample, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(byteLength, 40);

  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2);
  }

  fs.writeFileSync(filename, buffer);
  console.log(`wrote ${filename} (${(byteLength / 1024).toFixed(1)}kb)`);
}

function envelope(t, attack, release, total) {
  if (t < attack) return t / attack;
  if (t > total - release) return Math.max(0, (total - t) / release);
  return 1;
}

function generateClassic() {
  // Two chirps at 880Hz with silence between — classic alert tone.
  const total = 1.0;
  const samples = new Float32Array(Math.round(SAMPLE_RATE * total));
  const chirp = (start, duration, freq) => {
    const startIdx = Math.round(start * SAMPLE_RATE);
    const endIdx = Math.min(samples.length, startIdx + Math.round(duration * SAMPLE_RATE));
    for (let i = startIdx; i < endIdx; i++) {
      const t = (i - startIdx) / SAMPLE_RATE;
      const env = envelope(t, 0.01, 0.03, duration);
      samples[i] += 0.55 * env * Math.sin(2 * Math.PI * freq * t);
    }
  };
  chirp(0.00, 0.18, 880);
  chirp(0.30, 0.18, 880);
  chirp(0.60, 0.28, 1175);
  return samples;
}

function generateBell() {
  // Singing bowl: fundamental + harmonics with slow exponential decay.
  const total = 2.2;
  const samples = new Float32Array(Math.round(SAMPLE_RATE * total));
  const fundamentals = [
    { freq: 440, gain: 0.4, decay: 1.6 },
    { freq: 880, gain: 0.22, decay: 1.2 },
    { freq: 1320, gain: 0.12, decay: 0.9 },
    { freq: 1760, gain: 0.06, decay: 0.7 },
  ];
  for (let i = 0; i < samples.length; i++) {
    const t = i / SAMPLE_RATE;
    const attack = Math.min(1, t / 0.02);
    let sample = 0;
    for (const { freq, gain, decay } of fundamentals) {
      sample += gain * Math.exp(-t / decay) * Math.sin(2 * Math.PI * freq * t);
    }
    samples[i] = sample * attack * 0.9;
  }
  return samples;
}

function generateSiren() {
  // Frequency sweep 440→1100Hz twice over 1.2s — urgent alert.
  const total = 1.4;
  const samples = new Float32Array(Math.round(SAMPLE_RATE * total));
  let phase = 0;
  for (let i = 0; i < samples.length; i++) {
    const t = i / SAMPLE_RATE;
    const cycleT = (t % 0.6) / 0.6;
    const freq = 440 + (1100 - 440) * (cycleT < 0.5 ? cycleT * 2 : (1 - cycleT) * 2);
    phase += (2 * Math.PI * freq) / SAMPLE_RATE;
    const env = envelope(t, 0.02, 0.08, total);
    samples[i] = 0.6 * env * Math.sin(phase);
  }
  return samples;
}

fs.mkdirSync(OUT_DIR, { recursive: true });
writeWav(path.join(OUT_DIR, "beastmode_classic.wav"), generateClassic());
writeWav(path.join(OUT_DIR, "beastmode_bell.wav"), generateBell());
writeWav(path.join(OUT_DIR, "beastmode_siren.wav"), generateSiren());

console.log(`\nAll sounds generated in ${OUT_DIR}`);
