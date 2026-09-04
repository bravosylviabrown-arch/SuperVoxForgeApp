import React, { useCallback, useEffect, useRef, useState } from "react";
import { useApp, type Profile } from "../state/store";
import {
  decodeBlob, analyzeAudio, peaksOf, encodeWav, dataToBuffer, fmtDur, fmtTime, type Analysis,
} from "../lib/audio";
import { LANGS, type LangCode } from "../lib/tts";
import { Btn, Icon, Seg, Waveform, LiveWave, LevelMeter, Slider, Toggle, PageHead, HintBar } from "../ui";
import { getCtx } from "../lib/audio";

const STAGES = ["Décodage audio", "Normalisation crête", "Porte de bruit", "Suppression des silences", "Extraction F0 & spectre", "Signature acoustique 87-dim"];
const ACCEPT = "audio/*,.wav,.mp3,.flac,.aac,.m4a,.ogg,.opus,.amr,.aiff,.webm";

interface Result {
  analysis: Analysis;
  processed: Float32Array;
  sr: number;
  peaks: Float32Array;
  sourceName: string;
  source: "fichier" | "micro";
}

export default function ClonePage() {
  const { addProfile, toast, log, settings, nav } = useApp();
  const [mode, setMode] = useState<"fichier" | "micro">("fichier");
  const [drag, setDrag] = useState(false);
  const [stage, setStage] = useState(-1); // -1 inactif, 0..5 en cours, 6 terminé
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // formulaire profil
  const [name, setName] = useState("");
  const [tags, setTags] = useState("");
  const [lang, setLang] = useState<LangCode>(settings.defaultLang);
  const [consent, setConsent] = useState(false);
  const [saving, setSaving] = useState(false);

  // micro
  const [recState, setRecState] = useState<"idle" | "arming" | "rec" | "denied">("idle");
  const [recTime, setRecTime] = useState(0);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopMic = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (recRef.current && recRef.current.state !== "inactive") recRef.current.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);
  useEffect(() => () => stopMic(), [stopMic]);

  const runPipeline = useCallback(async (blob: Blob, sourceName: string, source: "fichier" | "micro") => {
    setError(null);
    setResult(null);
    try {
      setStage(0);
      const buffer = await decodeBlob(blob);
      if (buffer.duration < 2) throw new Error("Audio trop court (moins de 2 s). La forge a besoin d'au moins 5 s de parole.");
      setStage(1); await new Promise((r) => setTimeout(r, 240));
      setStage(2); await new Promise((r) => setTimeout(r, 240));
      setStage(3); await new Promise((r) => setTimeout(r, 200));
      setStage(4);
      await new Promise((r) => setTimeout(r, 120));
      const { analysis, processed } = analyzeAudio(buffer);
      setStage(5); await new Promise((r) => setTimeout(r, 260));
      const peaks = peaksOf(processed, 260);
      setStage(6);
      setResult({ analysis, processed, sr: buffer.sampleRate, peaks, sourceName, source });
      setName(source === "micro" ? "Ma voix (micro)" : sourceName.replace(/\.[^.]+$/, ""));
      log("ok", "clonage", `Analyse de « ${sourceName} » : ${fmtDur(analysis.duration)}, F0 ${analysis.f0 ?? "n/d"} Hz, SNR ${analysis.snr} dB → ${analysis.grade} (${analysis.score}/100).`);
      if (analysis.score < 50) log("warn", "Forgeron", "Qualité d'échantillon faible : suivez les conseils ci-dessous ou réenregistrez au calme.");
      else if (analysis.snr < 25) log("fix", "Forgeron", "Porte de bruit automatique appliquée pendant le prétraitement.");
      toast("ok", `Analyse terminée : ${analysis.grade} (${analysis.score}/100)`);
    } catch (e: any) {
      setStage(-1);
      const msg = e?.message ?? "Impossible de lire ce fichier audio.";
      setError(msg);
      log("err", "clonage", msg);
      toast("err", msg);
    }
  }, [log, toast]);

  const onFile = useCallback((f: File | undefined) => {
    if (!f) return;
    if (!/^audio\//.test(f.type) && !/\.(wav|mp3|flac|aac|m4a|ogg|opus|amr|aiff|webm)$/i.test(f.name)) {
      const msg = `Format « ${f.name.split(".").pop()} » non supporté. Formats acceptés : WAV, MP3, FLAC, AAC, M4A, OGG, OPUS, AMR, AIFF.`;
      setError(msg); log("err", "clonage", msg); toast("err", "Format non supporté.");
      return;
    }
    stopMic(); setRecState("idle");
    runPipeline(f, f.name, "fichier");
  }, [runPipeline, log, toast, stopMic]);

  const startMic = useCallback(async () => {
    setError(null); setResult(null);
    setRecState("arming");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      streamRef.current = stream;
      const ctx = getCtx();
      const src = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser();
      an.fftSize = 2048;
      src.connect(an);
      setAnalyser(an);
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4" : "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mime || "audio/webm" });
        setRecState("idle"); setRecTime(0);
        if (blob.size < 4000) { toast("warn", "Enregistrement trop court — maintenez au moins 5 secondes."); return; }
        runPipeline(blob, `enregistrement-${new Date().toISOString().slice(11, 19)}`, "micro");
      };
      recRef.current = rec;
      rec.start(250);
      setRecState("rec");
      setRecTime(0);
      timerRef.current = setInterval(() => {
        setRecTime((t) => {
          if (t + 0.1 >= 300) { stopMic(); log("info", "Forgeron", "Durée maximale de 5 min atteinte — arrêt automatique de l'enregistrement."); }
          return t + 0.1;
        });
      }, 100);
      log("ok", "micro", "Enregistrement démarré (antibruit + contrôle auto de gain activés).");
    } catch (e: any) {
      setRecState("denied");
      const denied = e?.name === "NotAllowedError" || e?.name === "SecurityError";
      const msg = denied
        ? "Micro refusé par le navigateur. Correction : icône 🔒/⚙ dans la barre d'adresse → Site → Micro → Autoriser → recharger."
        : "Aucun microphone détecté. Branchez un micro ou utilisez l'import de fichier.";
      setError(msg);
      log("warn", "Forgeron", msg);
      toast("err", denied ? "Permission micro refusée" : "Micro indisponible");
    }
  }, [runPipeline, log, toast, stopMic]);

  const create = useCallback(async () => {
    if (!result) return;
    if (!consent) { toast("warn", "Cochez le consentement obligatoire (droit d'utiliser cette voix)."); return; }
    setSaving(true);
    try {
      const blob = encodeWav(dataToBuffer(result.processed, result.sr), 16);
      const p = await addProfile({
        name: name.trim() || "Voix sans nom",
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 8),
        source: result.source === "micro" ? "micro" : "fichier",
        lang,
        duration: result.analysis.duration,
        quality: result.analysis.score,
        grade: result.analysis.grade,
        f0: result.analysis.f0,
        snr: result.analysis.snr,
        centroid: result.analysis.centroid,
        syllRate: result.analysis.syllRate,
        sampleRate: result.sr,
        features: result.analysis.features,
      }, blob);
      toast("ok", `Profil « ${p.name} » forgé ! Prêt pour la synthèse.`);
      setStage(-1); setResult(null); setConsent(false); setTags("");
      setTimeout(() => nav("synth"), 600);
    } catch {
      toast("err", "Échec de l'enregistrement du profil (stockage local indisponible ?).");
    } finally { setSaving(false); }
  }, [result, consent, name, tags, lang, addProfile, toast, nav]);

  const a = result?.analysis;

  return (
    <div>
      <PageHead icon="mic" title="Clonage vocal"
        sub="Importez un fichier (WAV, MP3, FLAC, AAC, M4A, OGG, OPUS — 8 kHz à 192 kHz, mono/stéréo) ou enregistrez au micro. Aucune durée limite imposée : 5 s minimum conseillées, 20 s à 3 min pour l'excellence." />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Seg options={[{ v: "fichier" as const, label: "Fichier audio" }, { v: "micro" as const, label: "Microphone" }]} value={mode} onChange={(m) => { setMode(m); if (m === "fichier") { stopMic(); setRecState("idle"); } }} />
        {stage >= 0 && stage < 6 && (
          <span className="flex items-center gap-2 font-mono text-[11px] text-ember2">
            <Icon name="refresh" size={13} className="spin" /> {STAGES[stage]}…
          </span>
        )}
        {stage === 6 && <span className="flex items-center gap-1.5 font-mono text-[11px] text-teal"><Icon name="check" size={13} /> Pipeline terminé</span>}
      </div>

      {mode === "fichier" && !result && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); onFile(e.dataTransfer.files?.[0]); }}
          className={`svf-panel flex cursor-pointer flex-col items-center justify-center px-6 py-14 text-center transition-all ${drag ? "border-ember bg-ember/8 shadow-[0_0_0_3px_var(--svf-glow)]" : "hover:border-line2"}`}
          onClick={() => fileRef.current?.click()}
          role="button" tabIndex={0} aria-label="Importer un fichier audio"
          onKeyDown={(e) => { if (e.key === "Enter") fileRef.current?.click(); }}>
          <input ref={fileRef} type="file" accept={ACCEPT} className="hidden" onChange={(e) => onFile(e.target.files?.[0] ?? undefined)} />
          <span className={`flex h-16 w-16 items-center justify-center rounded-2xl border transition-all ${drag ? "border-ember bg-ember/15 text-ember scale-110" : "border-line2 bg-panel2 text-ember"}`}>
            <Icon name={drag ? "download" : "file"} size={28} />
          </span>
          <p className="mt-4 font-display text-base font-bold text-txt">{drag ? "Déposez pour forger" : "Glissez votre fichier audio ici"}</p>
          <p className="mt-1 text-[13px] text-mut">ou cliquez pour parcourir · WAV, MP3, FLAC, AAC, M4A, OGG, OPUS, AMR</p>
          <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.18em] text-dim">16/24/32 bits · 8 kHz → 192 kHz · mono & stéréo</p>
        </div>
      )}

      {mode === "micro" && !result && (
        <div className="svf-panel p-6">
          <div className="rounded-xl border border-line bg-bg/60 px-4 py-3">
            <LiveWave analyser={analyser} active={recState === "rec"} height={110} />
            <div className="mt-2 flex items-center gap-3">
              <span className="font-mono text-[10px] uppercase tracking-widest text-dim">niveau</span>
              <div className="flex-1"><LevelMeter analyser={analyser} active={recState === "rec"} /></div>
              <span className={`font-mono text-lg tabular-nums ${recState === "rec" ? "text-ember2" : "text-dim"}`}>{fmtTime(recTime)}</span>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {recState !== "rec" ? (
              <Btn size="lg" icon="mic" onClick={startMic} disabled={recState === "arming"}>
                {recState === "arming" ? "Autorisation…" : "Démarrer l'enregistrement"}
              </Btn>
            ) : (
              <Btn size="lg" variant="danger" icon="stop" onClick={stopMic}>Arrêter & analyser</Btn>
            )}
            <p className="text-xs leading-relaxed text-mut">
              Parlez à <strong className="text-txt">15–20 cm du micro</strong>, dans un endroit calme, en continu.<br />
              Arrêt automatique à 5 min · minimum utile : 5 s.
            </p>
          </div>
          {recState === "rec" && (
            <div className="mt-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-err">
              <span className="h-2 w-2 rounded-full bg-err pulse-dot" /> enregistrement en cours
            </div>
          )}
        </div>
      )}

      {/* pipeline visuel */}
      {stage >= 0 && (
        <div className="svf-panel mt-4 grid grid-cols-2 gap-2 p-4 sm:grid-cols-3 lg:grid-cols-6">
          {STAGES.map((s, i) => (
            <div key={s} className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 transition-all ${i < stage ? "border-teal/30 bg-teal/8" : i === stage ? "border-ember/50 bg-ember/10" : "border-line bg-panel2 opacity-50"}`}>
              {i < stage ? <Icon name="check" size={13} className="text-teal" /> : i === stage ? <Icon name="refresh" size={13} className="spin text-ember" /> : <span className="font-mono text-[10px] text-dim">{i + 1}</span>}
              <span className={`text-[10.5px] font-medium leading-tight ${i <= stage ? "text-txt" : "text-dim"}`}>{s}</span>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-err/30 bg-err/8 px-4 py-3 text-[13px] text-err">
          <Icon name="alert" size={16} className="mt-0.5" /> {error}
        </div>
      )}

      {/* résultat */}
      {result && a && (
        <div className="anim-fade-up mt-4 grid gap-4 lg:grid-cols-12">
          <div className="svf-panel p-5 lg:col-span-7">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-display text-[13px] font-bold text-txt">Échantillon traité</h3>
              <span className="font-mono text-[10px] text-dim">{result.sourceName} · {(a.sampleRate / 1000).toFixed(1)} kHz</span>
            </div>
            <div className="rounded-xl border border-line bg-bg/60 p-3">
              <Waveform peaks={result.peaks} height={110} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {[
                { l: "Durée utile", v: fmtDur(a.duration) },
                { l: "F0 moyen", v: a.f0 ? `${Math.round(a.f0)} Hz` : "n/d", hot: true },
                { l: "Variation F0", v: a.f0Std ? `±${Math.round(a.f0Std)} Hz` : "—" },
                { l: "SNR estimé", v: `${a.snr} dB` },
                { l: "Débit syllabique", v: a.syllRate ? `${a.syllRate}/s` : "—" },
                { l: "Brillance", v: a.centroid ? `${(a.centroid / 1000).toFixed(1)} kHz` : "—" },
              ].map((m) => (
                <div key={m.l} className="svf-inset px-3 py-2.5">
                  <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-dim">{m.l}</p>
                  <p className={`mt-0.5 font-display text-sm font-bold ${m.hot ? "text-ember2" : "text-txt"}`}>{m.v}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center gap-4">
              <div className="relative h-16 w-16 shrink-0">
                <svg viewBox="0 0 36 36" className="h-16 w-16 -rotate-90">
                  <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--svf-line)" strokeWidth="3" />
                  <circle cx="18" cy="18" r="15.5" fill="none"
                    stroke={a.score >= 85 ? "var(--svf-teal)" : a.score >= 70 ? "var(--svf-ember)" : a.score >= 50 ? "var(--svf-warn)" : "var(--svf-err)"}
                    strokeWidth="3" strokeLinecap="round" strokeDasharray={`${(a.score / 100) * 97.4} 97.4`}
                    style={{ transition: "stroke-dasharray 1s cubic-bezier(0.2,0.8,0.2,1)" }} />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center font-display text-sm font-bold text-txt">{a.score}</span>
              </div>
              <div>
                <p className="font-display text-sm font-bold text-txt">Qualité : <span className={a.score >= 70 ? "text-teal" : "text-warn"}>{a.grade}</span></p>
                <ul className="mt-1 space-y-0.5">
                  {a.advice.slice(0, 3).map((ad) => (
                    <li key={ad} className="flex items-start gap-1.5 text-[11.5px] leading-snug text-mut">
                      <Icon name="spark" size={11} className="mt-0.5 shrink-0 text-ember" /> {ad}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div className="svf-panel flex flex-col p-5 lg:col-span-5">
            <h3 className="font-display text-[13px] font-bold text-txt">Créer le profil vocal</h3>
            <label className="mt-3 block">
              <span className="mb-1 block text-xs font-medium text-mut">Nom de la voix</span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40}
                className="h-10 w-full rounded-lg border border-line2 bg-bg/60 px-3 text-sm text-txt outline-none transition-colors focus:border-ember" placeholder="Ex. Ma voix — narration" />
            </label>
            <label className="mt-3 block">
              <span className="mb-1 block text-xs font-medium text-mut">Tags (séparés par des virgules)</span>
              <input value={tags} onChange={(e) => setTags(e.target.value)} maxLength={80}
                className="h-10 w-full rounded-lg border border-line2 bg-bg/60 px-3 text-sm text-txt outline-none transition-colors focus:border-ember" placeholder="narration, chaud, podcast" />
            </label>
            <label className="mt-3 block">
              <span className="mb-1 block text-xs font-medium text-mut">Langue principale parlée</span>
              <select value={lang} onChange={(e) => setLang(e.target.value as LangCode)}
                className="h-10 w-full rounded-lg border border-line2 bg-bg/60 px-3 text-sm text-txt outline-none focus:border-ember">
                {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
              </select>
            </label>
            <div className="mt-3 rounded-lg border border-line bg-panel2 p-3">
              <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-dim">Calibrage automatique pour la synthèse</p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-mut">
                F0 {a.f0 ? `${Math.round(a.f0)} Hz` : "n/d"} · débit {a.syllRate ? `${a.syllRate} syll/s` : "n/d"} — la synthèse calibrera automatiquement hauteur et vitesse pour <strong className="text-txt">humaniser</strong> le rendu dans cette voix.
              </p>
            </div>
            <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-lg border border-line bg-panel2 p-3">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--svf-ember)]" />
              <span className="text-[11.5px] leading-relaxed text-mut">
                <strong className="text-txt">Consentement obligatoire :</strong> je confirme avoir le droit d'utiliser cette voix (la mienne, ou avec l'accord explicite de la personne). Conformément à l'éthique SuperVoxForge et au RGPD.
              </span>
            </label>
            <div className="mt-auto flex gap-2 pt-4">
              <Btn className="flex-1" size="lg" icon="spark" onClick={create} disabled={saving || !consent}>
                {saving ? "Forge en cours…" : "Forger le profil vocal"}
              </Btn>
              <Btn variant="ghost" size="lg" onClick={() => { setResult(null); setStage(-1); }}>Refaire</Btn>
            </div>
          </div>
        </div>
      )}

      {!result && stage < 0 && (
        <div className="mt-4"><HintBar>Conseil du Forgeron : lisez un texte varié (questions, exclamations, narration) — la prosodie riche améliore le calibrage de la synthèse naturalisée.</HintBar></div>
      )}
    </div>
  );
}
