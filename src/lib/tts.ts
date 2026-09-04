/* ============================================================
   SuperVoxForge — moteur de synthèse vocale
   Utilise les voix neuronales NATIVES du navigateur (Chrome/Edge).
   → Aucune dépendance espeak-ng : l'erreur « espeak-ng
     indisponible / executable not found in $PATH » ne peut plus
     se produire : aucun exécutable externe n'est requis.
   Chunking par phrases + watchdog anti-blocage Chrome.
   ============================================================ */

export type LangCode = "fr-FR" | "en-GB" | "en-US" | "es-ES" | "de-DE" | "zh-CN";

export const LANGS: { code: LangCode; label: string; short: string; sample: string }[] = [
  { code: "fr-FR", label: "Français", short: "FR", sample: "Bonjour, ceci est un essai de voix SuperVoxForge. La forge vocale est prête." },
  { code: "en-GB", label: "Anglais britannique", short: "EN-GB", sample: "Hello, this is a SuperVoxForge voice preview. The vocal forge is ready." },
  { code: "en-US", label: "Anglais américain", short: "EN-US", sample: "Hey there, this is your SuperVoxForge voice. The vocal forge is ready to go." },
  { code: "es-ES", label: "Espagnol", short: "ES", sample: "Hola, esta es una prueba de voz de SuperVoxForge. La forja vocal está lista." },
  { code: "de-DE", label: "Allemand", short: "DE", sample: "Hallo, dies ist eine SuperVoxForge-Stimmprobe. Die Stimm-Schmiede ist bereit." },
  { code: "zh-CN", label: "Chinois mandarin", short: "中文", sample: "你好，这是 SuperVoxForge 的语音预览。语音工坊已准备就绪。" },
];

export const langLabel = (code: string) => LANGS.find((l) => l.code === code)?.label ?? code;

export function scoreVoice(v: SpeechSynthesisVoice): number {
  const n = v.name.toLowerCase();
  let s = 0;
  if (/natural|neural|premium|enhanced|online/.test(n)) s += 4;
  if (n.startsWith("google")) s += 3;
  if (/microsoft/.test(n) && /natural/.test(n)) s += 3;
  if (/compact|basic|espeak|whisper|bad/.test(n)) s -= 4;
  if (v.localService === false) s += 1; // voix cloud (Chrome/Edge) = haute qualité
  return s;
}

export interface SpeakOpts {
  text: string;
  voice: SpeechSynthesisVoice | null;
  lang: LangCode;
  rate: number;      // 0.5 – 2
  pitch: number;     // 0.5 – 2 (1 = neutre)
  volume: number;    // 0 – 1
  humanize: boolean;
  stability: number; // 0 – 1
  expressivity: number; // 0 – 1
}
export interface SpeakCb {
  onStart?: () => void;
  onBoundary?: (charIndex: number) => void;
  onProgress?: (p: number) => void;
  onEnd?: () => void;
  onError?: (msg: string) => void;
  onNote?: (msg: string) => void;
}
export interface SpeakHandle {
  stop: () => void;
  pause: () => void;
  resume: () => void;
  done: Promise<void>;
}

function splitSentences(text: string): string[] {
  const m = text.match(/[^.!?。…\n]+[.!?。…]*[ \t]*/g);
  if (!m) return text.trim() ? [text] : [];
  return m.map((s) => s.trim()).filter(Boolean);
}

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
export const semitonesToPitch = (st: number) => clamp(Math.pow(2, st / 12), 0.5, 2);

class TTSEngine {
  voices: SpeechSynthesisVoice[] = [];
  state: "idle" | "speaking" | "paused" = "idle";
  /** Piloté par les Paramètres (agent) — watchdog anti-blocage Chrome. */
  watchdogEnabled = true;
  private session = 0;
  private listeners = new Set<() => void>();
  private readyResolvers: (() => void)[] = [];
  private ready = false;
  private watchdog: ReturnType<typeof setInterval> | null = null;
  private lastEvent = 0;

  supported(): boolean {
    return typeof window !== "undefined" && "speechSynthesis" in window;
  }

  init(): Promise<void> {
    if (!this.supported()) return Promise.resolve();
    if (this.ready && this.voices.length) return Promise.resolve();
    const load = () => {
      const v = window.speechSynthesis.getVoices();
      if (v.length) {
        this.voices = [...v].sort((a, b) => scoreVoice(b) - scoreVoice(a));
        this.ready = true;
        this.listeners.forEach((l) => l());
        this.readyResolvers.forEach((r) => r());
        this.readyResolvers = [];
      }
    };
    load();
    window.speechSynthesis.onvoiceschanged = load;
    return new Promise((res) => {
      if (this.ready) return res();
      this.readyResolvers.push(res);
      let tries = 0;
      const iv = setInterval(() => {
        load();
        if (this.ready || ++tries > 14) { clearInterval(iv); res(); }
      }, 250);
    });
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  voicesFor(lang: LangCode): SpeechSynthesisVoice[] {
    const base = lang.slice(0, 2);
    return this.voices
      .filter((v) => v.lang.toLowerCase().replace("_", "-").startsWith(base))
      .sort((a, b) => {
        const ea = v0langEq(a, lang), eb = v0langEq(b, lang);
        if (ea !== eb) return (eb ? 1 : 0) - (ea ? 1 : 0);
        return scoreVoice(b) - scoreVoice(a);
      });
  }

  bestFor(lang: LangCode): SpeechSynthesisVoice | null {
    const list = this.voicesFor(lang);
    if (list.length) return list[0];
    // repli : même famille de langue, puis n'importe quelle voix
    const base = lang.slice(0, 2);
    const fam = this.voices.filter((v) => v.lang.toLowerCase().startsWith(base));
    if (fam.length) return fam[0];
    return this.voices[0] ?? null;
  }

  speak(opts: SpeakOpts, cb: SpeakCb): SpeakHandle {
    const synth = window.speechSynthesis;
    this.stop();
    this.session++;
    const sid = this.session;
    const sentences = splitSentences(opts.text);
    const total = Math.max(1, sentences.reduce((s, x) => s + x.length, 0));
    let cancelled = false;
    let offset = 0;
    let charsDone = 0;
    let paused = false;
    let current: SpeechSynthesisUtterance | null = null;

    const armWatchdog = () => {
      this.lastEvent = performance.now();
      if (this.watchdog) clearInterval(this.watchdog);
      this.watchdog = setInterval(() => {
        if (cancelled || paused || !this.watchdogEnabled) return;
        const dt = performance.now() - this.lastEvent;
        if (dt > 4500 && synth.speaking && !synth.paused) {
          synth.pause();
          setTimeout(() => { if (!cancelled) synth.resume(); }, 60);
          this.lastEvent = performance.now();
          cb.onNote?.("Agent : micro-blocage du moteur détecté et corrigé automatiquement (watchdog).");
        }
      }, 1200);
    };

    const run = async () => {
      if (!sentences.length) { cb.onEnd?.(); return; }
      this.state = "speaking";
      cb.onStart?.();
      armWatchdog();
      await new Promise((r) => setTimeout(r, 70)); // laisse Chrome digérer le cancel() précédent
      for (let i = 0; i < sentences.length; i++) {
        if (cancelled || sid !== this.session) break;
        const sentence = sentences[i];
        const jitter = opts.humanize ? 1 + (((i * 37) % 7) - 3) * 0.006 * (1.2 - opts.stability) : 1;
        const pitchAlt = opts.humanize && opts.stability < 0.8 ? 1 + ((i % 2 === 0 ? 1 : -1) * 0.02 * (1 - opts.stability)) : 1;
        const u = new SpeechSynthesisUtterance(sentence);
        current = u;
        u.voice = opts.voice;
        u.lang = opts.voice?.lang ?? opts.lang;
        u.rate = clamp(opts.rate * jitter, 0.3, 2.2);
        u.pitch = clamp(opts.pitch * pitchAlt, 0.1, 2);
        u.volume = clamp(opts.volume, 0, 1);
        u.onboundary = (e) => {
          this.lastEvent = performance.now();
          cb.onBoundary?.(offset + e.charIndex);
          cb.onProgress?.(clamp((charsDone + e.charIndex) / total, 0, 1));
        };
        u.onend = () => { this.lastEvent = performance.now(); };
        u.onerror = (e) => {
          if (e.error !== "canceled" && e.error !== "interrupted") cb.onError?.(`Erreur de synthèse : ${e.error}`);
        };
        synth.speak(u);
        await new Promise<void>((res) => {
          u.onend = () => { this.lastEvent = performance.now(); res(); };
          const check = setInterval(() => {
            if (cancelled || sid !== this.session || !synth.speaking) { clearInterval(check); res(); }
          }, 180);
        });
        charsDone += sentence.length;
        offset += sentence.length + 1;
        cb.onProgress?.(clamp(charsDone / total, 0, 1));
        if (cancelled || sid !== this.session) break;
        if (opts.humanize && i < sentences.length - 1) {
          const gap = 70 + opts.expressivity * 220;
          await new Promise((r) => setTimeout(r, gap));
        }
      }
      if (sid === this.session) {
        this.state = "idle";
        if (this.watchdog) { clearInterval(this.watchdog); this.watchdog = null; }
        cb.onEnd?.();
      }
    };

    const done = run();
    return {
      done,
      stop: () => {
        cancelled = true;
        if (this.watchdog) { clearInterval(this.watchdog); this.watchdog = null; }
        synth.cancel();
        this.state = "idle";
      },
      pause: () => { paused = true; synth.pause(); this.state = "paused"; },
      resume: () => { paused = false; this.lastEvent = performance.now(); synth.resume(); this.state = "speaking"; },
    };
  }

  stop(): void {
    if (!this.supported()) return;
    this.session++;
    window.speechSynthesis.cancel();
    this.state = "idle";
  }

  /** Diagnostic : couverture des 6 langues cibles. */
  coverage(): { lang: LangCode; count: number; best: SpeechSynthesisVoice | null }[] {
    return LANGS.map((l) => {
      const list = this.voicesFor(l.code);
      return { lang: l.code, count: list.length, best: list[0] ?? null };
    });
  }
}

function v0langEq(v: SpeechSynthesisVoice, lang: LangCode): boolean {
  return v.lang.toLowerCase().replace("_", "-") === lang.toLowerCase();
}

export const tts = new TTSEngine();

/* ---- Personnalités « Google AI Studio » résolues sur les voix locales ---- */
export interface GeminiPreset { id: string; name: string; desc: string; lang: LangCode; rate: number; pitch: number; }
export const GEMINI_PRESETS: GeminiPreset[] = [
  { id: "puck", name: "Puck", desc: "Énergique et jeune", lang: "en-US", rate: 1.06, pitch: 1.08 },
  { id: "charon", name: "Charon", desc: "Profonde et posée", lang: "en-GB", rate: 0.95, pitch: 0.86 },
  { id: "kore", name: "Kore", desc: "Claire et chaleureuse", lang: "en-US", rate: 1.0, pitch: 1.04 },
  { id: "fenrir", name: "Fenrir", desc: "Narrative et grave", lang: "en-GB", rate: 0.92, pitch: 0.92 },
  { id: "aoede", name: "Aoede", desc: "Douce et expressive", lang: "en-US", rate: 0.98, pitch: 1.0 },
];
