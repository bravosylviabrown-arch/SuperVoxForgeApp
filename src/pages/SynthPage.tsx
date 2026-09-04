import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../state/store";
import { tts, LANGS, GEMINI_PRESETS, semitonesToPitch, type LangCode, type SpeakHandle } from "../lib/tts";
import { translateText, detectLang } from "../lib/translate";
import { downloadText, fmtTime } from "../lib/audio";
import { Btn, Icon, Chip, Slider, Toggle, Seg, PageHead, HintBar, Kbd } from "../ui";

type VoiceSel = { kind: "clone"; id: string } | { kind: "preset"; id: string } | { kind: "native"; uri: string };

const PRESETS: { id: string; label: string; rate: number; st: number; stab: number; expr: number }[] = [
  { id: "std", label: "Standard", rate: 1, st: 0, stab: 0.7, expr: 0.4 },
  { id: "narr", label: "Narration", rate: 0.94, st: -1, stab: 0.85, expr: 0.55 },
  { id: "slow", label: "Lecture lente", rate: 0.78, st: 0, stab: 0.9, expr: 0.3 },
  { id: "child", label: "Enfant lent", rate: 0.72, st: 4, stab: 0.8, expr: 0.6 },
  { id: "energy", label: "Énergique", rate: 1.18, st: 1, stab: 0.5, expr: 0.75 },
];

export default function SynthPage() {
  const { profiles, settings, sessionText, sessionLang, setSession, toast, log, online, voicesTick } = useApp();
  void voicesTick;
  const [sel, setSel] = useState<VoiceSel | null>(() => {
    const saved = localStorage.getItem("svf-synth-clone");
    if (saved && profiles.some((p) => p.id === saved)) return { kind: "clone", id: saved };
    localStorage.removeItem("svf-synth-clone");
    return profiles[0] ? { kind: "clone", id: profiles[0].id } : null;
  });
  const [rate, setRate] = useState(settings.defaultRate);
  const [pitchSt, setPitchSt] = useState(settings.defaultPitchSt);
  const [stability, setStability] = useState(0.7);
  const [expressivity, setExpressivity] = useState(0.4);
  const [volume, setVolume] = useState(1);
  const [humanize, setHumanize] = useState(settings.humanize);
  const [presetId, setPresetId] = useState("std");

  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [wordIdx, setWordIdx] = useState(-1);
  const [tradTarget, setTradTarget] = useState<LangCode>("en-US");
  const [trading, setTrading] = useState(false);
  const handleRef = useRef<SpeakHandle | null>(null);
  const srtRef = useRef<{ i: number; t: number }[]>([]);
  const startRef = useRef(0);
  const sentenceOffsets = useRef<number[]>([]);

  const text = sessionText;
  const lang = sessionLang;

  const words = useMemo(() => {
    const out: { w: string; start: number }[] = [];
    const re = /\S+\s*/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) out.push({ w: m[0], start: m.index });
    return out;
  }, [text]);

  useEffect(() => () => { handleRef.current?.stop(); }, []);

  const resolveVoice = useCallback((): { voice: SpeechSynthesisVoice | null; label: string; calibRate: number; calibPitch: number } => {
    if (sel?.kind === "clone") {
      const p = profiles.find((x) => x.id === sel.id);
      if (p) {
        const v = tts.bestFor(p.lang);
        const calibPitch = p.f0 ? Math.min(1.35, Math.max(0.72, p.f0 / 172)) : 1;
        const calibRate = p.syllRate ? Math.min(1.12, Math.max(0.82, p.syllRate / 4.3)) : 1;
        return { voice: v, label: `${p.name} (calibrée)`, calibRate, calibPitch };
      }
    }
    if (sel?.kind === "preset") {
      const g = GEMINI_PRESETS.find((x) => x.id === sel.id)!;
      return { voice: tts.bestFor(g.lang), label: `${g.name} · AI Studio`, calibRate: g.rate, calibPitch: g.pitch };
    }
    if (sel?.kind === "native") {
      const v = tts.voices.find((x) => x.voiceURI === sel.uri) ?? null;
      return { voice: v, label: v?.name ?? "Voix", calibRate: 1, calibPitch: 1 };
    }
    return { voice: tts.bestFor(lang), label: "Auto (meilleure voix)", calibRate: 1, calibPitch: 1 };
  }, [sel, profiles, lang]);

  const generate = useCallback(() => {
    const clean = text.trim();
    if (!clean) { toast("warn", "Saisissez d'abord un texte à synthétiser."); return; }
    const { voice, calibRate, calibPitch } = resolveVoice();
    if (!voice && tts.voices.length === 0) {
      log("err", "synthèse", "Aucune voix disponible dans ce navigateur. Ouvrez SuperVoxForge dans Chrome ou Edge.");
      toast("err", "Aucune voix détectée — utilisez Chrome ou Edge.");
      return;
    }
    if (clean.length > 5000) log("fix", "Forgeron", "Texte long : découpage automatique en segments avec prosodie naturelle (aucune limite de durée).");
    sentenceOffsets.current = [];
    const re = /[^.!?。…\n]+[.!?。…]*[ \t]*/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(clean))) sentenceOffsets.current.push(m.index);
    srtRef.current = [];
    startRef.current = performance.now();
    setSpeaking(true); setPaused(false); setProgress(0); setWordIdx(0);
    handleRef.current = tts.speak({
      text: clean, voice, lang,
      rate: rate * calibRate,
      pitch: semitonesToPitch(pitchSt) * calibPitch,
      volume, humanize, stability, expressivity,
    }, {
      onBoundary: (ci) => {
        let wi = 0;
        for (let i = 0; i < words.length; i++) { if (words[i].start <= ci) wi = i; else break; }
        setWordIdx(wi);
        const si = sentenceOffsets.current.filter((o) => o <= ci).length - 1;
        if (si >= 0 && (!srtRef.current.length || srtRef.current[srtRef.current.length - 1].i !== si)) {
          srtRef.current.push({ i: si, t: (performance.now() - startRef.current) / 1000 });
        }
      },
      onProgress: setProgress,
      onNote: (msg) => log("fix", "Forgeron", msg),
      onError: (msg) => { toast("err", msg); log("err", "synthèse", msg); },
      onEnd: () => { setSpeaking(false); setPaused(false); setProgress(1); setWordIdx(-1); },
    });
  }, [text, lang, rate, pitchSt, volume, humanize, stability, expressivity, resolveVoice, words, toast, log]);

  const exportSrt = useCallback(() => {
    if (!srtRef.current.length) { toast("warn", "Lancez d'abord une synthèse pour générer le minutage."); return; }
    const fmt = (t: number) => {
      const h = Math.floor(t / 3600), mm = Math.floor((t % 3600) / 60), s = Math.floor(t % 60), ms = Math.floor((t % 1) * 1000);
      return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
    };
    const sentences = text.match(/[^.!?。…\n]+[.!?。…]*[ \t]*/g) ?? [];
    const lines: string[] = [];
    srtRef.current.forEach((s, k) => {
      const end = k + 1 < srtRef.current.length ? srtRef.current[k + 1].t : s.t + Math.max(1.5, (sentences[s.i]?.length ?? 20) * 0.06);
      lines.push(`${k + 1}\n${fmt(s.t)} --> ${fmt(end)}\n${(sentences[s.i] ?? "").trim()}\n`);
    });
    downloadText("supervoxforge_sous-titres.srt", lines.join("\n"), "text/srt;charset=utf-8");
    toast("ok", "Sous-titres SRT exportés.");
  }, [text, toast]);

  const translateNow = useCallback(async () => {
    const clean = text.trim();
    if (!clean) { toast("warn", "Aucun texte à traduire."); return; }
    setTrading(true);
    try {
      const src = detectLang(clean);
      const res = await translateText(clean, src, tradTarget, settings.openRouterKey || undefined);
      setSession({ text: res.text, lang: tradTarget });
      log("ok", "traduction", `Texte traduit (${src} → ${tradTarget}) via ${res.engine} — prêt à être lu avec la voix sélectionnée.`);
      toast("ok", `Traduit via ${res.engine}`);
    } catch (e: any) {
      log("err", "traduction", e?.message ?? "Échec de traduction");
      toast("err", online ? (e?.message ?? "Échec de la traduction") : "Traduction impossible hors ligne — le Forgeron suggère de coller votre propre traduction.");
    } finally { setTrading(false); }
  }, [text, tradTarget, settings.openRouterKey, online, setSession, toast, log]);

  const applyPreset = (id: string) => {
    const p = PRESETS.find((x) => x.id === id)!;
    setPresetId(id); setRate(p.rate); setPitchSt(p.st); setStability(p.stab); setExpressivity(p.expr);
  };

  const { label: voiceLabel } = resolveVoice();
  const nativeForLang = tts.voicesFor(lang).slice(0, 8);

  return (
    <div>
      <PageHead icon="wave" title="Synthèse vocale"
        sub={`Moteur neuronal natif — aucune dépendance espeak-ng. Voix actuelle : ${voiceLabel}. Textes illimités, jusqu'à 15 min de lecture continue (découpage intelligent).`} />

      <div className="grid gap-4 lg:grid-cols-12">
        {/* colonne texte */}
        <div className="space-y-4 lg:col-span-7">
          <div className="svf-panel p-4">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-dim">Langue du texte</span>
              <Seg options={LANGS.map((l) => ({ v: l.code, label: l.short }))} value={lang} onChange={(v) => setSession({ lang: v })} />
              <span className="ml-auto font-mono text-[10px] tabular-nums text-dim">{text.length.toLocaleString("fr-FR")} caractères · ~{Math.max(1, Math.round(text.split(/\s+/).filter(Boolean).length / (2.4 * rate)))} s de lecture</span>
            </div>
            <textarea
              value={text}
              onChange={(e) => setSession({ text: e.target.value })}
              onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); generate(); } }}
              placeholder="Écrivez ou collez ici le texte à faire parler… (aucune limite : articles, livres audio, scripts, annonces) — Ctrl+Entrée pour synthétiser"
              className="h-44 w-full resize-y rounded-xl border border-line bg-bg/60 p-3.5 text-[15px] leading-relaxed text-txt outline-none transition-colors focus:border-ember"
            />
            {/* traduction inline */}
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-panel2 p-2.5">
              <span className="flex items-center gap-1.5 pl-1 text-xs font-medium text-mut"><Icon name="translate" size={14} className="text-ember" /> Traduire puis lire en :</span>
              <select value={tradTarget} onChange={(e) => setTradTarget(e.target.value as LangCode)}
                className="h-8 rounded-lg border border-line2 bg-bg/60 px-2 text-xs text-txt outline-none focus:border-ember">
                {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
              </select>
              <Btn size="sm" icon="translate" onClick={translateNow} disabled={trading || !text.trim()}>
                {trading ? "Traduction…" : "Traduire le texte"}
              </Btn>
              <span className="ml-auto hidden font-mono text-[9px] text-dim sm:block">{online ? "MyMemory" + (settings.openRouterKey ? " + OpenRouter" : " (gratuit)") : "hors ligne"}</span>
            </div>
            {/* lecture avec surlignage */}
            {(speaking || wordIdx >= 0) && (
              <div className="anim-fade mt-3 max-h-36 overflow-y-auto rounded-xl border border-ember/25 bg-ember/6 p-3.5 text-[14.5px] leading-relaxed text-mut">
                {words.map((w, i) => (
                  <span key={i} className={i === wordIdx ? "word-hl" : i < wordIdx ? "text-txt" : ""}>{w.w}</span>
                ))}
              </div>
            )}
          </div>

          {/* transport */}
          <div className="svf-panel p-4">
            <div className="flex flex-wrap items-center gap-2">
              {!speaking ? (
                <Btn size="lg" icon="play" onClick={generate}>Générer & lire</Btn>
              ) : (
                <>
                  <Btn size="lg" variant="outline" icon={paused ? "play" : "pause"} onClick={() => { if (paused) { handleRef.current?.resume(); setPaused(false); } else { handleRef.current?.pause(); setPaused(true); } }}>
                    {paused ? "Reprendre" : "Pause"}
                  </Btn>
                  <Btn size="lg" variant="danger" icon="stop" onClick={() => { handleRef.current?.stop(); setSpeaking(false); setPaused(false); setWordIdx(-1); }}>Stop</Btn>
                </>
              )}
              <div className="min-w-[140px] flex-1">
                <div className="h-2 w-full overflow-hidden rounded-full bg-panel2">
                  <div className="h-full rounded-full bg-ember transition-[width] duration-200" style={{ width: `${Math.round(progress * 100)}%` }} />
                </div>
                <div className="mt-1 flex justify-between font-mono text-[9px] text-dim">
                  <span>{speaking ? (paused ? "en pause" : "lecture en cours…") : "prêt"}</span>
                  <span className="tabular-nums">{Math.round(progress * 100)} %</span>
                </div>
              </div>
              <Btn variant="ghost" size="sm" icon="download" onClick={exportSrt}>SRT</Btn>
              <Btn variant="ghost" size="sm" icon="file" onClick={() => { if (!text.trim()) return toast("warn", "Rien à exporter."); downloadText("supervoxforge_texte.txt", text); toast("ok", "Texte exporté (.txt)."); }}>TXT</Btn>
            </div>
            <p className="mt-2.5 text-[11px] leading-relaxed text-dim">
              L'audio du navigateur se lit en direct (flux naturel). Pour obtenir un <strong className="text-mut">fichier audio de la synthèse</strong> : convertissez un échantillon via « Conversion V→V », ou enregistrez la sortie avec l'enregistreur système — le Guide détaille la méthode en 3 clics.
            </p>
          </div>
        </div>

        {/* colonne voix + réglages */}
        <div className="space-y-4 lg:col-span-5">
          <div className="svf-panel p-4">
            <h3 className="mb-2.5 font-mono text-[9px] uppercase tracking-[0.18em] text-dim">Choix de la voix</h3>
            {profiles.length > 0 && (
              <>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ember2">Mes voix clonées (calibrées)</p>
                <div className="mb-3 space-y-1">
                  {profiles.map((p) => (
                    <button key={p.id} onClick={() => setSel({ kind: "clone", id: p.id })}
                      className={`btn-press flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-xs ${sel?.kind === "clone" && sel.id === p.id ? "border-ember bg-ember/10 text-ember2" : "border-line bg-panel2 text-mut hover:border-line2 hover:text-txt"}`}>
                      <span className="flex items-center gap-2"><Icon name="mic" size={13} /> <strong className="font-medium text-txt">{p.name}</strong></span>
                      <span className="font-mono text-[9px] text-dim">{p.f0 ? Math.round(p.f0) + " Hz" : ""} · {p.grade}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-teal">Google AI Studio (présélections)</p>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {GEMINI_PRESETS.map((g) => (
                <Chip key={g.id} active={sel?.kind === "preset" && sel.id === g.id} onClick={() => setSel({ kind: "preset", id: g.id })}>
                  {g.name} <span className="opacity-60">· {g.desc}</span>
                </Chip>
              ))}
            </div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-mut">Voix locales — {LANGS.find((l) => l.code === lang)?.label}</p>
            {nativeForLang.length === 0 ? (
              <p className="rounded-lg border border-warn/25 bg-warn/8 px-3 py-2 text-[11px] text-warn">Aucune voix {LANGS.find((l) => l.code === lang)?.short} détectée — repli automatique du Forgeron sur la meilleure voix disponible.</p>
            ) : (
              <div className="max-h-40 space-y-1 overflow-y-auto pr-1">
                {nativeForLang.map((v) => (
                  <button key={v.voiceURI} onClick={() => setSel({ kind: "native", uri: v.voiceURI })}
                    className={`btn-press flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-1.5 text-left text-xs ${sel?.kind === "native" && sel.uri === v.voiceURI ? "border-ember bg-ember/10 text-ember2" : "border-line bg-panel2 text-mut hover:border-line2 hover:text-txt"}`}>
                    <span className="truncate">{v.name}</span>
                    {/natural|neural|google/i.test(v.name) && <span className="shrink-0 rounded bg-teal/12 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider text-teal">haute qualité</span>}
                  </button>
                ))}
              </div>
            )}
            <Btn variant="ghost" size="sm" icon="play" className="mt-2"
              onClick={() => {
                const { voice, calibPitch, calibRate } = resolveVoice();
                const sample = LANGS.find((l) => l.code === (sel?.kind === "clone" ? profiles.find((p) => p.id === (sel as any).id)?.lang : lang))?.sample ?? LANGS[0].sample;
                handleRef.current?.stop();
                handleRef.current = tts.speak({ text: sample, voice, lang, rate: calibRate, pitch: calibPitch, volume: 1, humanize: false, stability: 1, expressivity: 0 }, { onEnd: () => setSpeaking(false) });
                setSpeaking(true); setPaused(false); setWordIdx(-1); setProgress(0);
              }}>
              Pré-écouter la voix sélectionnée
            </Btn>
          </div>

          <div className="svf-panel p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-mono text-[9px] uppercase tracking-[0.18em] text-dim">Paramètres avancés</h3>
              <span className="flex items-center gap-2 text-[11px] text-mut">Humaniser <Toggle on={humanize} onChange={setHumanize} label="Humaniser la prosodie" /></span>
            </div>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {PRESETS.map((p) => <Chip key={p.id} active={presetId === p.id} onClick={() => applyPreset(p.id)}>{p.label}</Chip>)}
            </div>
            <div className="space-y-3.5">
              <Slider label="Vitesse de lecture" value={rate} min={0.5} max={2} step={0.02} onChange={setRate} fmt={(v) => v.toFixed(2) + "×"} />
              <Slider label="Tonalité" value={pitchSt} min={-12} max={12} step={1} onChange={setPitchSt} fmt={(v) => (v > 0 ? "+" : "") + v + " st"} accent />
              <Slider label="Stabilité" value={stability} min={0} max={1} step={0.05} onChange={setStability} fmt={(v) => Math.round(v * 100) + " %"} />
              <Slider label="Expressivité (pauses & relief)" value={expressivity} min={0} max={1} step={0.05} onChange={setExpressivity} fmt={(v) => Math.round(v * 100) + " %"} />
              <Slider label="Volume" value={volume} min={0} max={1} step={0.05} onChange={setVolume} fmt={(v) => Math.round(v * 100) + " %"} />
            </div>
            <p className="mt-3 text-[10.5px] leading-relaxed text-dim">
              « Humaniser » active la micro-variation de débit, les pauses de phrase et l'alternance de hauteur — le rendu perd son côté robotique. Avec une voix clonée, le calibrage F0/débit s'ajoute automatiquement.
            </p>
          </div>

          <div className="hidden lg:block">
            <HintBar>Raccourci : <Kbd>3</Kbd> ouvre cette page · <Kbd>Ctrl</Kbd>+<Kbd>Entrée</Kbd> dans le champ texte lance la synthèse.</HintBar>
          </div>
        </div>
      </div>
    </div>
  );
}
