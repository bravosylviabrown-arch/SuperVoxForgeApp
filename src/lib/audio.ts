/* ============================================================
   SuperVoxForge — moteur audio local (Web Audio API)
   Décodage, DSP, analyse, encodage WAV, stockage IndexedDB.
   Aucun serveur requis : tout tourne dans le navigateur.
   ============================================================ */

export type Grade = "Excellent" | "Bon" | "Correct" | "Faible";

export interface Analysis {
  duration: number;
  sampleRate: number;
  rms: number;
  peak: number;
  snr: number;
  f0: number | null;
  f0Std: number;
  voicedRatio: number;
  centroid: number;
  syllRate: number;
  score: number;
  grade: Grade;
  advice: string[];
  features: number[]; // signature acoustique locale (90 dim)
}

let _ctx: AudioContext | null = null;
export function getCtx(): AudioContext {
  if (!_ctx) _ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  if (_ctx.state === "suspended") _ctx.resume().catch(() => {});
  return _ctx;
}

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

/* ---------- décodage ---------- */
export async function decodeBlob(blob: Blob): Promise<AudioBuffer> {
  const ab = await blob.arrayBuffer();
  const ctx = getCtx();
  try {
    return await ctx.decodeAudioData(ab.slice(0));
  } catch {
    throw new Error("Format audio non décodable par le navigateur. Essayez WAV, MP3, OGG, M4A/AAC, FLAC ou OPUS.");
  }
}

export function monoData(buf: AudioBuffer): Float32Array {
  if (buf.numberOfChannels === 1) return buf.getChannelData(0);
  const l = buf.getChannelData(0);
  const r = buf.getChannelData(1 % buf.numberOfChannels);
  const out = new Float32Array(l.length);
  for (let i = 0; i < l.length; i++) out[i] = (l[i] + r[i]) * 0.5;
  return out;
}

export function dataToBuffer(data: Float32Array, sampleRate: number): AudioBuffer {
  const ctx = getCtx();
  const b = ctx.createBuffer(1, data.length, sampleRate);
  b.getChannelData(0).set(data);
  return b;
}

export async function resampleBuffer(buf: AudioBuffer, targetSr: number): Promise<AudioBuffer> {
  if (Math.abs(buf.sampleRate - targetSr) < 1) return buf;
  const off = new OfflineAudioContext(1, Math.ceil((buf.duration * targetSr) + 1), targetSr);
  const src = off.createBufferSource();
  src.buffer = buf;
  src.connect(off.destination);
  src.start();
  return off.startRendering();
}

/* ---------- DSP de base ---------- */
export function peakNormalize(data: Float32Array, target = 0.977): Float32Array {
  let peak = 0;
  for (let i = 0; i < data.length; i++) { const a = Math.abs(data[i]); if (a > peak) peak = a; }
  if (peak < 1e-6) return data;
  const g = target / peak;
  if (Math.abs(g - 1) < 0.01) return data;
  const out = new Float32Array(data.length);
  for (let i = 0; i < data.length; i++) out[i] = data[i] * g;
  return out;
}

function frameRms(data: Float32Array, frame: number, hop: number): number[] {
  const out: number[] = [];
  for (let s = 0; s + frame <= data.length; s += hop) {
    let sum = 0;
    for (let i = s; i < s + frame; i++) sum += data[i] * data[i];
    out.push(Math.sqrt(sum / frame));
  }
  return out;
}

/** Estimateur de SNR : plancher de bruit = 10e percentile des RMS de trames. */
export function estimateSnr(data: Float32Array, sr: number): number {
  const fr = frameRms(data, Math.floor(sr * 0.03), Math.floor(sr * 0.015));
  if (fr.length < 8) return 20;
  const sorted = [...fr].sort((a, b) => a - b);
  const floor = Math.max(sorted[Math.floor(sorted.length * 0.1)], 1e-5);
  const active = fr.filter((v) => v > floor * 2);
  const sig = active.length ? Math.sqrt(active.reduce((s, v) => s + v * v, 0) / active.length) : floor * 2;
  return Math.max(0, Math.min(80, 20 * Math.log10(sig / floor)));
}

/** Porte de bruit descendante (expander) — adoucie par enveloppe attack/release. */
export function noiseGate(data: Float32Array, sr: number, opts?: { thresh?: number; ratio?: number }): Float32Array {
  const thresh = opts?.thresh ?? 0.012;
  const ratio = opts?.ratio ?? 4;
  const out = new Float32Array(data.length);
  const att = Math.exp(-1 / (sr * 0.004));
  const rel = Math.exp(-1 / (sr * 0.06));
  let env = 0;
  for (let i = 0; i < data.length; i++) {
    const a = Math.abs(data[i]);
    env = a > env ? att * env + (1 - att) * a : rel * env + (1 - rel) * a;
    let g = 1;
    if (env < thresh) g = Math.pow(env / thresh, ratio - 1);
    out[i] = data[i] * Math.max(0.02, g);
  }
  return out;
}

export function trimSilence(data: Float32Array, sr: number, thresh = 0.008): Float32Array {
  const win = Math.floor(sr * 0.02);
  let start = 0, end = data.length;
  const rmsAt = (s: number) => {
    let sum = 0;
    for (let i = s; i < Math.min(s + win, data.length); i++) sum += data[i] * data[i];
    return Math.sqrt(sum / win);
  };
  while (start + win < data.length && rmsAt(start) < thresh) start += win;
  while (end - win > start && rmsAt(end - win) < thresh) end -= win;
  const pad = Math.floor(sr * 0.08);
  start = Math.max(0, start - pad);
  end = Math.min(data.length, end + pad);
  return data.slice(start, end);
}

/* ---------- FFT (radix-2 itératif) ---------- */
function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]; re[i] = re[j]; re[j] = tr;
      const ti = im[i]; im[i] = im[j]; im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
}

const melOf = (f: number) => 2595 * Math.log10(1 + f / 700);
const hzOf = (m: number) => 700 * (Math.pow(10, m / 2595) - 1);

/** Signatures spectrales + prosodiques (90 dimensions, 100% locales). */
export function spectralFeatures(data: Float32Array, sr: number, f0: number | null, f0Std: number, snr: number, voiced: number): number[] {
  const N = 1024;
  const hop = N / 2;
  const nbFrames = Math.min(260, Math.max(1, Math.floor((data.length - N) / hop)));
  const step = Math.max(1, Math.floor(Math.floor((data.length - N) / hop) / nbFrames));
  const nBands = 40;
  const melMin = melOf(80), melMax = melOf(Math.min(sr / 2, 8200));
  const centers: number[] = [];
  for (let b = 0; b < nBands + 2; b++) centers.push(hzOf(melMin + ((melMax - melMin) * b) / (nBands + 1)));
  const binHz = sr / N;
  const windowFn = new Float32Array(N);
  for (let i = 0; i < N; i++) windowFn[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
  const sums = new Float64Array(nBands), sq = new Float64Array(nBands);
  let cSum = 0, cSq = 0, zSum = 0, count = 0;
  const re = new Float32Array(N), im = new Float32Array(N);
  for (let f = 0; f < nbFrames; f++) {
    const s = f * step * hop;
    if (s + N > data.length) break;
    let frameE = 0;
    for (let i = 0; i < N; i++) { re[i] = data[s + i] * windowFn[i]; im[i] = 0; frameE += data[s + i] * data[s + i]; }
    if (frameE < 1e-7) continue;
    fft(re, im);
    const mag = new Float32Array(N / 2);
    for (let k = 0; k < N / 2; k++) mag[k] = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
    let num = 0, den = 0;
    for (let b = 0; b < nBands; b++) {
      const k0 = Math.max(1, Math.floor(centers[b] / binHz));
      const k1 = Math.min(N / 2 - 1, Math.ceil(centers[b + 2] / binHz));
      let e = 0;
      for (let k = k0; k <= k1; k++) e += mag[k] * mag[k];
      const le = Math.log(e + 1e-9);
      sums[b] += le; sq[b] += le * le;
    }
    for (let k = 1; k < N / 2; k++) { num += k * mag[k]; den += mag[k]; }
    const c = den > 0 ? (num / den) * binHz : 0;
    cSum += c; cSq += c * c;
    let zc = 0;
    for (let i = 1; i < N; i++) if ((data[s + i] >= 0) !== (data[s + i - 1] >= 0)) zc++;
    zSum += zc / N;
    count++;
  }
  const feats: number[] = [];
  const n = Math.max(1, count);
  for (let b = 0; b < nBands; b++) {
    const m = sums[b] / n;
    feats.push(m, Math.sqrt(Math.max(0, sq[b] / n - m * m)));
  }
  const cm = cSum / n;
  feats.push(cm, Math.sqrt(Math.max(0, cSq / n - cm * cm)), zSum / n);
  feats.push(f0 ?? 0, f0Std, voiced, snr / 80);
  return feats; // 80 + 3 + 4 = 87 dims
}

/* ---------- F0 par autocorrélation ---------- */
function decimate16k(data: Float32Array, sr: number): { d: Float32Array; sr: number } {
  if (sr <= 17000) return { d: data, sr };
  const k = Math.round(sr / 16000);
  const out = new Float32Array(Math.floor(data.length / k));
  for (let i = 0; i < out.length; i++) {
    let s = 0;
    for (let j = 0; j < k; j++) s += data[i * k + j];
    out[i] = s / k;
  }
  return { d: out, sr: sr / k };
}

export function computeF0(data: Float32Array, sr: number): { f0: number | null; f0Std: number; voicedRatio: number } {
  const { d, sr: s } = decimate16k(data, sr);
  const N = 1024, hop = 512;
  const total = Math.floor((d.length - N) / hop);
  if (total < 4) return { f0: null, f0Std: 0, voicedRatio: 0 };
  const maxFrames = Math.min(total, 380);
  const stride = Math.max(1, Math.floor(total / maxFrames));
  const lagMin = Math.max(32, Math.floor(s / 380));
  const lagMax = Math.min(N - 2, Math.floor(s / 60));
  const vals: number[] = [];
  let voiced = 0, checked = 0;
  const fr = new Float32Array(N);
  for (let f = 0; f < total; f += stride) {
    const o = f * hop;
    let e = 0;
    for (let i = 0; i < N; i++) { fr[i] = d[o + i]; e += d[o + i] * d[o + i]; }
    if (e / N < 4e-5) continue;
    checked++;
    const r0 = e;
    let best = 0, bestLag = -1;
    for (let lag = lagMin; lag <= lagMax; lag++) {
      let r = 0;
      const lim = N - lag;
      for (let i = 0; i < lim; i++) r += fr[i] * fr[i + lag];
      r /= r0;
      if (r > best) { best = r; bestLag = lag; }
    }
    if (best > 0.42 && bestLag > 0) {
      const f0 = s / bestLag;
      if (f0 >= 60 && f0 <= 380) { vals.push(f0); voiced++; }
    }
  }
  if (vals.length < 3) return { f0: null, f0Std: 0, voicedRatio: checked ? voiced / checked : 0 };
  vals.sort((a, b) => a - b);
  const med = vals[Math.floor(vals.length / 2)];
  const kept = vals.filter((v) => Math.abs(v - med) < med * 0.35);
  const mean = kept.reduce((a, b) => a + b, 0) / kept.length;
  const std = Math.sqrt(kept.reduce((a, b) => a + (b - mean) * (b - mean), 0) / kept.length);
  return { f0: Math.round(mean * 10) / 10, f0Std: std, voicedRatio: checked ? voiced / checked : 0 };
}

export function estimateSyllRate(data: Float32Array, sr: number): number {
  const { d, sr: s } = decimate16k(data, sr);
  const env = frameRms(d, 512, 256);
  if (env.length < 10) return 0;
  const mean = env.reduce((a, b) => a + b, 0) / env.length;
  let peaks = 0;
  for (let i = 1; i < env.length - 1; i++) {
    if (env[i] > env[i - 1] && env[i] >= env[i + 1] && env[i] > mean * 0.75) peaks++;
  }
  const secs = d.length / s;
  return secs > 0.5 ? Math.min(12, peaks / secs) : 0;
}

/* ---------- analyse complète ---------- */
export function rmsOf(data: Float32Array): number {
  let s = 0;
  for (let i = 0; i < data.length; i++) s += data[i] * data[i];
  return Math.sqrt(s / Math.max(1, data.length));
}

export function analyzeAudio(buffer: AudioBuffer): { analysis: Analysis; processed: Float32Array } {
  const sr = buffer.sampleRate;
  const duration = buffer.duration;
  let data = monoData(buffer);
  const rawPeak = (() => { let p = 0; for (let i = 0; i < data.length; i++) { const a = Math.abs(data[i]); if (a > p) p = a; } return p; })();
  const snr = estimateSnr(data, sr);
  data = peakNormalize(data);
  data = noiseGate(data, sr);
  const processed = trimSilence(data, sr);
  const work = processed.length > sr * 45 ? processed.slice(0, sr * 45) : processed; // analyse bornée (perf)
  const { f0, f0Std, voicedRatio } = computeF0(work, sr);
  const centroidFeat = spectralFeatures(work, sr, f0, f0Std, snr, voicedRatio);
  const centroid = centroidFeat[80] || 0;
  const syllRate = estimateSyllRate(work, sr);
  const rms = rmsOf(processed);
  const advice: string[] = [];
  let score = 0;
  const durPts = Math.min(30, (Math.min(duration, 60) / 60) * 30);
  score += durPts;
  if (duration < 10) advice.push("Échantillon court : visez 20 s à 3 min de parole continue pour un profil plus fidèle.");
  else if (duration < 20) advice.push("Un échantillon de 30 s ou plus améliorerait nettement la stabilité du profil.");
  score += Math.min(30, snr * 0.9);
  if (snr < 15) advice.push("Bruit de fond détecté : réenregistrez dans une pièce calme, micro à 15–20 cm de la bouche.");
  else if (snr < 25) advice.push("Léger bruit de fond : le débruitage intégré a été appliqué automatiquement.");
  if (rawPeak > 0.99) advice.push("Saturation (clipping) détectée à l'entrée : baissez le gain d'enregistrement de quelques dB.");
  else score += 10;
  const voicedPts = Math.min(20, voicedRatio * 30);
  score += voicedPts;
  if (voicedRatio < 0.35) advice.push("Peu de segments de parole détectés : parlez en continu, évitez les longs silences.");
  if (f0 === null) advice.push("Hauteur fondamentale non détectée : vérifiez que la voix est bien au premier plan.");
  else score += 10;
  score = Math.round(Math.min(100, score));
  const grade: Grade = score >= 85 ? "Excellent" : score >= 70 ? "Bon" : score >= 50 ? "Correct" : "Faible";
  if (!advice.length) advice.push("Échantillon de très bonne qualité : aucune correction nécessaire.");
  return {
    analysis: { duration, sampleRate: sr, rms, peak: rawPeak, snr: Math.round(snr * 10) / 10, f0, f0Std: Math.round(f0Std * 10) / 10, voicedRatio: Math.round(voicedRatio * 100) / 100, centroid: Math.round(centroid), syllRate: Math.round(syllRate * 10) / 10, score, grade, advice, features: centroidFeat },
    processed,
  };
}

/* ---------- forme d'onde ---------- */
export function peaksOf(data: Float32Array, n: number): Float32Array {
  const out = new Float32Array(n * 2);
  const bs = Math.max(1, Math.floor(data.length / n));
  for (let i = 0; i < n; i++) {
    let mn = 1, mx = -1;
    const s = i * bs;
    const e = Math.min(data.length, s + bs);
    for (let j = s; j < e; j += Math.max(1, Math.floor(bs / 60))) {
      const v = data[j];
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
    out[i * 2] = mn; out[i * 2 + 1] = mx;
  }
  return out;
}

/* ---------- encodage WAV ---------- */
export function encodeWav(buffer: AudioBuffer, bits: 16 | 24 | 32 = 16): Blob {
  const ch = Math.min(2, buffer.numberOfChannels);
  const sr = buffer.sampleRate;
  const len = buffer.length;
  const bytes = bits / 8;
  const dataSize = len * ch * bytes;
  const ab = new ArrayBuffer(44 + dataSize);
  const v = new DataView(ab);
  const ws = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, "RIFF"); v.setUint32(4, 36 + dataSize, true); ws(8, "WAVE"); ws(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * ch * bytes, true); v.setUint16(32, ch * bytes, true); v.setUint16(34, bits, true);
  ws(36, "data"); v.setUint32(40, dataSize, true);
  const chans: Float32Array[] = [];
  for (let c = 0; c < ch; c++) chans.push(buffer.getChannelData(c));
  let o = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < ch; c++) {
      const s = Math.max(-1, Math.min(1, chans[c][i]));
      if (bits === 16) { v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2; }
      else if (bits === 24) { const x = Math.round(s < 0 ? s * 0x800000 : s * 0x7fffff); v.setUint8(o, x & 255); v.setUint8(o + 1, (x >> 8) & 255); v.setUint8(o + 2, (x >> 16) & 255); o += 3; }
      else { v.setFloat32(o, s, true); o += 4; }
    }
  }
  return new Blob([ab], { type: "audio/wav" });
}

/* ---------- rendu hors-ligne (conversion / amélioration) ---------- */
export interface EnhanceOpts {
  detuneCents: number;
  speed: number;
  warmDb: number;
  brightDb: number;
  compThreshold: number;
  reverbWet: number;
  gainDb: number;
  gate: number; // 0..1, appliqué sur les samples avant graphe
  targetSr?: number;
}

export function makeImpulse(ctx: BaseAudioContext, seconds: number, decay: number): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(2, len, sr);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

export function buildEnhanceGraph(
  ctx: BaseAudioContext,
  source: AudioBufferSourceNode,
  opts: EnhanceOpts,
  destination: AudioNode
): { comp: DynamicsCompressorNode; warm: BiquadFilterNode; bright: BiquadFilterNode; wet: GainNode; dry: GainNode; master: GainNode } {
  source.detune.value = opts.detuneCents;
  source.playbackRate.value = opts.speed;
  (source as any).preservesPitch = true;
  const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 70;
  const warm = ctx.createBiquadFilter(); warm.type = "lowshelf"; warm.frequency.value = 240; warm.gain.value = opts.warmDb;
  const bright = ctx.createBiquadFilter(); bright.type = "highshelf"; bright.frequency.value = 3600; bright.gain.value = opts.brightDb;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = opts.compThreshold; comp.knee.value = 12; comp.ratio.value = 3.2; comp.attack.value = 0.004; comp.release.value = 0.18;
  const dry = ctx.createGain(); dry.gain.value = 1 - opts.reverbWet * 0.5;
  const conv = ctx.createConvolver(); conv.buffer = makeImpulse(ctx, 1.6, 2.6);
  const wet = ctx.createGain(); wet.gain.value = opts.reverbWet;
  const master = ctx.createGain(); master.gain.value = Math.pow(10, opts.gainDb / 20);
  source.connect(hp); hp.connect(warm); warm.connect(bright); bright.connect(comp);
  comp.connect(dry); dry.connect(master);
  comp.connect(conv); conv.connect(wet); wet.connect(master);
  master.connect(destination);
  return { comp, warm, bright, wet, dry, master };
}

export async function renderEnhanced(buffer: AudioBuffer, opts: EnhanceOpts): Promise<AudioBuffer> {
  let src = buffer;
  if (opts.gate > 0.01) {
    const d = monoData(buffer);
    const gated = noiseGate(d, buffer.sampleRate, { thresh: 0.006 + opts.gate * 0.03, ratio: 2 + opts.gate * 5 });
    src = dataToBuffer(peakNormalize(gated, 0.97), buffer.sampleRate);
  }
  const sr = opts.targetSr ?? src.sampleRate;
  const dur = src.duration / Math.max(0.25, opts.speed);
  const off = new OfflineAudioContext(1, Math.ceil((dur + 2.2) * sr), sr);
  const source = off.createBufferSource();
  source.buffer = src;
  buildEnhanceGraph(off, source, opts, off.destination);
  source.start();
  const rendered = await off.startRendering();
  // coupe la réverb résiduelle au-delà de dur + 0.9 s
  const cut = Math.min(rendered.length, Math.ceil((dur + 0.9) * sr));
  const final = getCtx().createBuffer(1, cut, sr);
  final.getChannelData(0).set(rendered.getChannelData(0).subarray(0, cut));
  return final;
}

/* ---------- stockage IndexedDB ---------- */
const DB_NAME = "supervoxforge";
function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const rq = indexedDB.open(DB_NAME, 1);
    rq.onupgradeneeded = () => {
      const d = rq.result;
      if (!d.objectStoreNames.contains("audio")) d.createObjectStore("audio");
    };
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error);
  });
}
export async function idbPut(key: string, val: Blob): Promise<void> {
  const d = await idb();
  return new Promise((res, rej) => {
    const t = d.transaction("audio", "readwrite");
    t.objectStore("audio").put(val, key);
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
  });
}
export async function idbGet(key: string): Promise<Blob | undefined> {
  const d = await idb();
  return new Promise((res, rej) => {
    const rq = d.transaction("audio").objectStore("audio").get(key);
    rq.onsuccess = () => res(rq.result as Blob | undefined);
    rq.onerror = () => rej(rq.error);
  });
}
export async function idbDel(key: string): Promise<void> {
  const d = await idb();
  return new Promise((res) => {
    const t = d.transaction("audio", "readwrite");
    t.objectStore("audio").delete(key);
    t.oncomplete = () => res();
    t.onerror = () => res();
  });
}

/* ---------- téléchargements ---------- */
export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
export function downloadText(filename: string, content: string, mime = "text/plain;charset=utf-8"): void {
  downloadBlob(filename, new Blob([content], { type: mime }));
}

/* ---------- utilitaires ---------- */
export function fmtTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 10);
  return m > 0 ? `${m}:${String(s).padStart(2, "0")}.${ms}` : `${s}.${ms}s`;
}
export function fmtDur(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m > 0 ? `${m} min ${s} s` : `${s} s`;
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function colorOf(id: string): string {
  const hues = [18, 32, 168, 196, 262, 340, 48, 210];
  return `hsl(${hues[hashString(id) % hues.length]} 72% 58%)`;
}
