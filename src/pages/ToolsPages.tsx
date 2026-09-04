import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp, type Profile } from "../state/store";
import {
  decodeBlob, monoData, peaksOf, computeF0, encodeWav, renderEnhanced, resampleBuffer,
  dataToBuffer, idbGet, downloadBlob, downloadText, fmtDur, fmtTime, estimateSnr, type EnhanceOpts,
} from "../lib/audio";
import { tts, LANGS, type LangCode } from "../lib/tts";
import { translateText, detectLang } from "../lib/translate";
import { Btn, Icon, Chip, Slider, Toggle, PageHead, HintBar, Waveform, usePlayer, Empty, Seg } from "../ui";

const clampN = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

/* ============================ CONVERSION V→V ============================ */
export function ConvertPage() {
  const { profiles, settings, setSlot, toast, log, nav } = useApp();
  const [srcBuf, setSrcBuf] = useState<AudioBuffer | null>(null);
  const [srcName, setSrcName] = useState("");
  const [srcPeaks, setSrcPeaks] = useState<Float32Array | null>(null);
  const [srcF0, setSrcF0] = useState<number | null>(null);
  const [targetId, setTargetId] = useState(profiles[0]?.id ?? "");
  const [detune, setDetune] = useState(0);
  const [autoDetune, setAutoDetune] = useState(true);
  const [bright, setBright] = useState(0);
  const [busy, setBusy] = useState(false);
  const [outBuf, setOutBuf] = useState<AudioBuffer | null>(null);
  const [outPeaks, setOutPeaks] = useState<Float32Array | null>(null);
  const player = usePlayer();
  const fileRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  const target = profiles.find((p) => p.id === targetId) ?? null;

  const loadSource = useCallback(async (blob: Blob, name: string) => {
    try {
      setBusy(true);
      const buf = await decodeBlob(blob);
      const data = monoData(buf);
      const { f0 } = computeF0(data, buf.sampleRate);
      setSrcBuf(buf); setSrcName(name);
      setSrcPeaks(peaksOf(data, 240));
      setSrcF0(f0);
      log("ok", "conversion", `Source « ${name} » chargée : ${fmtDur(buf.duration)}, F0 ${f0 ? Math.round(f0) + " Hz" : "n/d"}.`);
      const t = profiles.find((p) => p.id === targetId);
      if (autoDetune && f0 && t?.f0) setDetune(Math.round(1200 * Math.log2(t.f0 / f0)));
    } catch (e: any) { toast("err", e?.message ?? "Fichier illisible."); }
    finally { setBusy(false); }
  }, [profiles, targetId, autoDetune, log, toast]);

  useEffect(() => {
    if (autoDetune && srcF0 && target?.f0) setDetune(Math.round(clampN(1200 * Math.log2(target.f0 / srcF0), -1400, 1400)));
  }, [targetId, autoDetune, srcF0, target]);

  const convert = useCallback(async () => {
    if (!srcBuf || !target) return;
    setBusy(true);
    try {
      const opts: EnhanceOpts = { detuneCents: detune, speed: 1, warmDb: 0, brightDb: bright, compThreshold: -32, reverbWet: 0, gainDb: 1.5, gate: 0 };
      const rendered = await renderEnhanced(srcBuf, opts);
      setOutBuf(rendered);
      setOutPeaks(peaksOf(monoData(rendered), 240));
      player.load(rendered);
      log("ok", "conversion", `Conversion terminée vers « ${target.name} » : transposition ${detune >= 0 ? "+" : ""}${detune} cents, prosodie et rythme préservés.`);
      toast("ok", "Conversion terminée — écoutez le résultat !");
    } catch { toast("err", "Échec du rendu de conversion."); }
    finally { setBusy(false); }
  }, [srcBuf, target, detune, bright, player, log, toast]);

  const exportOut = useCallback(async () => {
    if (!outBuf) return;
    const rs = await resampleBuffer(outBuf, settings.wavSr);
    downloadBlob(`supervoxforge_conversion_${Date.now()}.wav`, encodeWav(rs, settings.wavBits));
    toast("ok", `Export WAV ${settings.wavBits} bits / ${(settings.wavSr / 1000).toFixed(1)} kHz téléchargé.`);
  }, [outBuf, settings, toast]);

  if (!profiles.length)
    return (
      <div>
        <PageHead icon="swap" title="Conversion voix-à-voix" sub="Transformez n'importe quel enregistrement vocal vers l'une de vos voix clonées, en conservant rythme, intonation et émotion." />
        <Empty icon="mic" title="Une voix clonée est nécessaire" desc="La conversion transpose l'audio source vers la tessiture et le timbre d'un profil vocal. Forgez d'abord une voix."
          action={<Btn icon="mic" onClick={() => nav("clone")}>Cloner une voix</Btn>} />
      </div>
    );

  return (
    <div>
      <PageHead icon="swap" title="Conversion voix-à-voix" sub="Transformez n'importe quel enregistrement vocal vers l'une de vos voix clonées, en conservant rythme, intonation et émotion." />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="svf-panel p-5">
          <h3 className="font-mono text-[9px] uppercase tracking-[0.18em] text-dim">1 · Audio source</h3>
          <input ref={fileRef} type="file" accept="audio/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) loadSource(f, f.name); }} />
          <div
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) loadSource(f, f.name); }}
            onClick={() => fileRef.current?.click()}
            className={`mt-2 cursor-pointer rounded-xl border border-dashed px-4 py-8 text-center transition-all ${drag ? "border-ember bg-ember/8" : "border-line2 hover:border-ember/50"}`}
            role="button" aria-label="Importer l'audio source">
            {srcBuf ? (
              <>
                <p className="truncate text-sm font-semibold text-txt">{srcName}</p>
                <p className="mt-1 font-mono text-[10px] text-dim">{fmtDur(srcBuf.duration)} · F0 {srcF0 ? Math.round(srcF0) + " Hz" : "n/d"} · cliquez pour remplacer</p>
                <div className="mt-3"><Waveform peaks={srcPeaks} height={64} dim /></div>
              </>
            ) : (
              <>
                <Icon name="upload" size={24} className="mx-auto text-ember" />
                <p className="mt-2 text-sm font-medium text-txt">Glissez l'audio à convertir</p>
                <p className="text-xs text-mut">ou cliquez pour parcourir</p>
              </>
            )}
          </div>

          <h3 className="mt-5 font-mono text-[9px] uppercase tracking-[0.18em] text-dim">2 · Voix cible</h3>
          <div className="mt-2 space-y-1.5">
            {profiles.map((p) => (
              <button key={p.id} onClick={() => setTargetId(p.id)}
                className={`btn-press flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-xs ${targetId === p.id ? "border-ember bg-ember/10 text-ember2" : "border-line bg-panel2 text-mut hover:text-txt"}`}>
                <span className="font-medium text-txt">{p.name}</span>
                <span className="font-mono text-[9px] text-dim">{p.f0 ? Math.round(p.f0) + " Hz" : "F0 n/d"} · {p.grade}</span>
              </button>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between">
            <span className="text-xs font-medium text-mut">Transposition automatique (F0 source → F0 cible)</span>
            <Toggle on={autoDetune} onChange={setAutoDetune} label="Transposition automatique" />
          </div>
          <div className="mt-3">
            <Slider label="Transposition" value={detune} min={-1200} max={1200} step={10} onChange={(v) => { setAutoDetune(false); setDetune(v); }} fmt={(v) => (v >= 0 ? "+" : "") + v + " cents"} accent />
          </div>
          <div className="mt-3">
            <Slider label="Brillance (timbre cible)" value={bright} min={-6} max={6} step={0.5} onChange={setBright} fmt={(v) => (v >= 0 ? "+" : "") + v + " dB"} />
          </div>
          <Btn className="mt-4 w-full" size="lg" icon="spark" disabled={!srcBuf || busy} onClick={convert}>
            {busy ? "Conversion en cours…" : "Convertir vers la voix cible"}
          </Btn>
        </div>

        <div className="svf-panel flex flex-col p-5">
          <h3 className="font-mono text-[9px] uppercase tracking-[0.18em] text-dim">3 · Résultat</h3>
          {!outBuf ? (
            <Empty icon="swap" title="En attente de conversion" desc="Le résultat apparaîtra ici avec sa forme d'onde, sa pré-écoute et ses exports." />
          ) : (
            <div className="anim-fade-up">
              <div className="mt-2 rounded-xl border border-line bg-bg/60 p-3">
                <Waveform peaks={outPeaks} height={100} progress={player.duration ? player.position / player.duration : 0} onSeek={(f) => player.seek(f)} />
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Btn icon={player.state === "playing" ? "pause" : "play"} onClick={() => player.toggle()}>{player.state === "playing" ? "Pause" : "Écouter"}</Btn>
                <Btn variant="outline" icon="stop" onClick={() => player.stop()}>Stop</Btn>
                <span className="ml-auto font-mono text-[11px] tabular-nums text-mut">{fmtTime(player.position)} / {fmtTime(player.duration)}</span>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-2">
                <Btn variant="teal" icon="download" onClick={exportOut}>Exporter en WAV {settings.wavBits} bits / {(settings.wavSr / 1000).toFixed(1)} kHz</Btn>
                <Btn variant="outline" icon="sliders" onClick={() => { setSlot({ name: "Conversion — " + (target?.name ?? ""), buffer: outBuf, origin: "convert" }); nav("enhancer"); toast("info", "Résultat transmis à l'Améliorateur."); }}>
                  Continuer dans l'Améliorateur
                </Btn>
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-dim">La prosodie, le rythme et l'intention de l'audio source sont préservés ; seule la tessiture (et le timbre via la brillance) est déplacée vers la voix cible.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================ TRADUCTION ============================ */
export function TranslatePage() {
  const { settings, online, toast, log, setSession, nav } = useApp();
  const [src, setSrc] = useState("");
  const [out, setOut] = useState("");
  const [engine, setEngine] = useState("");
  const [target, setTarget] = useState<LangCode>("en-US");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<{ src: string; out: string; target: LangCode; t: number }[]>(() => {
    try { return JSON.parse(localStorage.getItem("svf-trad-hist") || "[]"); } catch { return []; }
  });
  const detected = useMemo(() => (src.trim().length > 3 ? detectLang(src) : null), [src]);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => () => tts.stop(), []);

  const run = useCallback(async (overrideTarget?: LangCode) => {
    const t = overrideTarget ?? target;
    if (!src.trim()) { toast("warn", "Collez d'abord un texte à traduire."); return; }
    setBusy(true);
    try {
      const s = detected ?? "fr-FR";
      const res = await translateText(src, s, t, settings.openRouterKey || undefined);
      setOut(res.text); setEngine(res.engine);
      const h = [{ src: src.slice(0, 300), out: res.text.slice(0, 300), target: t, t: Date.now() }, ...history].slice(0, 8);
      setHistory(h); localStorage.setItem("svf-trad-hist", JSON.stringify(h));
      log("ok", "traduction", `Traduction ${s} → ${t} réussie via ${res.engine} (${res.text.length} caractères).`);
      toast("ok", "Traduction terminée");
    } catch (e: any) {
      log("err", "traduction", e?.message ?? "Échec");
      if (!online) { toast("err", "Hors ligne : la traduction API est suspendue. Reconnectez-vous ou collez votre traduction."); log("fix", "Forgeron", "Conseil : collez votre propre traduction dans le champ résultat, puis « Lire avec une voix » — la synthèse, elle, reste 100% locale."); }
      else toast("err", e?.message ?? "Échec de la traduction");
    } finally { setBusy(false); }
  }, [src, target, detected, settings.openRouterKey, history, online, toast, log]);

  const speakOut = useCallback(() => {
    const clean = out.trim();
    if (!clean) { toast("warn", "Aucun texte traduit à lire."); return; }
    if (speaking) { tts.stop(); setSpeaking(false); return; }
    const voice = tts.bestFor(target);
    setSpeaking(true);
    tts.speak({ text: clean, voice, lang: target, rate: 1, pitch: 1, volume: 1, humanize: true, stability: 0.7, expressivity: 0.4 }, {
      onEnd: () => setSpeaking(false),
      onNote: (m) => log("fix", "Forgeron", m),
    });
  }, [out, target, speaking, toast, log]);

  return (
    <div>
      <PageHead icon="translate" title="Traduction multilingue"
        sub="6 langues : anglais britannique & américain, français, espagnol, allemand, chinois mandarin. Détection automatique de la langue source, puis lecture du résultat avec la voix de votre choix." />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="svf-panel flex flex-col p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-dim">Texte source</span>
            {detected && <span className="rounded-full border border-teal/30 bg-teal/10 px-2 py-0.5 font-mono text-[9px] text-teal">détecté : {LANGS.find((l) => l.code === detected)?.label}</span>}
          </div>
          <textarea value={src} onChange={(e) => setSrc(e.target.value)} placeholder="Collez ici le texte à traduire…"
            className="h-48 w-full flex-1 resize-y rounded-xl border border-line bg-bg/60 p-3.5 text-[14.5px] leading-relaxed text-txt outline-none focus:border-ember" />
          <div className="mt-3">
            <p className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-dim">Langue cible</p>
            <div className="flex flex-wrap gap-1.5">
              {LANGS.map((l) => <Chip key={l.code} active={target === l.code} onClick={() => setTarget(l.code)}>{l.label}</Chip>)}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Btn icon="translate" onClick={() => run()} disabled={busy}>{busy ? "Traduction en cours…" : "Traduire"}</Btn>
            <Btn variant="outline" icon="swap" onClick={() => { setSrc(out); setOut(src); const d = detected; if (d) setTarget(d); }} disabled={!out}>Inverser</Btn>
            <span className="ml-auto self-center font-mono text-[9px] text-dim">{online ? `moteur : ${settings.openRouterKey ? "OpenRouter (votre clé) → repli MyMemory" : "MyMemory (gratuit)"}` : "hors ligne — synthèse locale active"}</span>
          </div>
        </div>

        <div className="svf-panel flex flex-col p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-dim">Traduction</span>
            {engine && <span className="font-mono text-[9px] text-teal">{engine}</span>}
          </div>
          <textarea value={out} onChange={(e) => setOut(e.target.value)} placeholder="Le résultat apparaîtra ici. Vous pouvez aussi coller votre propre traduction puis la faire lire."
            className="h-48 w-full flex-1 resize-y rounded-xl border border-line bg-bg/60 p-3.5 text-[14.5px] leading-relaxed text-txt outline-none focus:border-teal" />
          <div className="mt-3 flex flex-wrap gap-2">
            <Btn variant="teal" icon={speaking ? "stop" : "play"} onClick={speakOut} disabled={!out.trim()}>{speaking ? "Arrêter la lecture" : "Lire avec une voix"}</Btn>
            <Btn variant="outline" icon="wave" disabled={!out.trim()} onClick={() => { setSession({ text: out, lang: target }); nav("synth"); toast("info", "Traduction envoyée vers la Synthèse vocale."); }}>Ouvrir en synthèse</Btn>
            <Btn variant="ghost" icon="copy" disabled={!out.trim()} onClick={() => { navigator.clipboard.writeText(out).then(() => toast("ok", "Copié !")); }}>Copier</Btn>
            <Btn variant="ghost" icon="download" disabled={!out.trim()} onClick={() => { downloadText("supervoxforge_traduction.txt", `${src}\n\n---\n\n${out}`); toast("ok", "Fichier .txt téléchargé."); }}>TXT</Btn>
          </div>
        </div>
      </div>

      {history.length > 0 && (
        <div className="svf-panel mt-4 p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.18em] text-dim"><Icon name="history" size={13} className="text-ember" /> Historique (8 dernières)</h3>
            <button className="btn-press text-[11px] text-dim hover:text-err" onClick={() => { setHistory([]); localStorage.removeItem("svf-trad-hist"); }}>Effacer</button>
          </div>
          <div className="space-y-1.5">
            {history.map((h) => (
              <button key={h.t} onClick={() => { setSrc(h.src); setOut(h.out); setTarget(h.target); }}
                className="btn-press flex w-full items-center gap-3 rounded-lg border border-line bg-panel2 px-3 py-2 text-left hover:border-line2">
                <span className="rounded bg-ember/12 px-1.5 py-0.5 font-mono text-[9px] text-ember2">{LANGS.find((l) => l.code === h.target)?.short}</span>
                <span className="min-w-0 flex-1 truncate text-xs text-mut">{h.src} <span className="text-dim">→</span> <span className="text-txt">{h.out}</span></span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================ AMÉLIORATEUR ============================ */
const DEF_OPTS: EnhanceOpts = { detuneCents: 0, speed: 1, warmDb: 0, brightDb: 0, compThreshold: -32, reverbWet: 0.04, gainDb: 0, gate: 0.2 };

export function EnhancerPage() {
  const { slot, setSlot, profiles, settings, addProfile, toast, log, nav } = useApp();
  const [buf, setBuf] = useState<AudioBuffer | null>(null);
  const [name, setName] = useState("");
  const [origin, setOrigin] = useState("");
  const [peaks, setPeaks] = useState<Float32Array | null>(null);
  const [opts, setOpts] = useState<EnhanceOpts>(DEF_OPTS);
  const [mode, setMode] = useState<"auto" | "manuel" | "hybride">("hybride");
  const [ab, setAb] = useState<"A" | "B">("B");
  const [busy, setBusy] = useState(false);
  const [finalName, setFinalName] = useState("");
  const player = usePlayer();
  const fileRef = useRef<HTMLInputElement>(null);
  const currentBuf = useRef<AudioBuffer | null>(null);

  const loadBuffer = useCallback((b: AudioBuffer, label: string, blobUrlName: string) => {
    setBuf(b); setName(blobUrlName); setOrigin(label);
    setPeaks(peaksOf(monoData(b), 240));
    currentBuf.current = b;
    player.load(b);
    log("ok", "améliorateur", `Source chargée : « ${blobUrlName} » (${fmtDur(b.duration)}, origine ${label}).`);
  }, [player, log]);

  useEffect(() => {
    if (slot) { loadBuffer(slot.buffer, slot.origin, slot.name); setSlot(null); }
  }, [slot, loadBuffer, setSlot]);

  const onFile = useCallback(async (f: File | undefined) => {
    if (!f) return;
    try { setBusy(true); loadBuffer(await decodeBlob(f), "fichier", f.name); }
    catch (e: any) { toast("err", e?.message ?? "Fichier illisible"); }
    finally { setBusy(false); }
  }, [loadBuffer, toast]);

  const loadProfileSample = useCallback(async (id: string) => {
    const p = profiles.find((x) => x.id === id);
    if (!p) return;
    try { setBusy(true); const blob = await idbGet(p.sampleKey); if (!blob) throw new Error("x"); loadBuffer(await decodeBlob(blob), "bibliothèque", p.name); }
    catch { toast("err", "Échantillon introuvable."); }
    finally { setBusy(false); }
  }, [profiles, loadBuffer, toast]);

  const renderMode = useCallback(async (o: EnhanceOpts): Promise<AudioBuffer | null> => {
    if (!buf) return null;
    setBusy(true);
    try { return await renderEnhanced(buf, o); }
    catch { toast("err", "Échec du rendu."); return null; }
    finally { setBusy(false); }
  }, [buf, toast]);

  const playAb = useCallback(async (which: "A" | "B") => {
    setAb(which);
    if (!buf) return;
    if (which === "A") { currentBuf.current = buf; player.load(buf); player.play(); return; }
    const rendered = await renderMode(opts);
    if (rendered) { currentBuf.current = rendered; player.load(rendered); player.play(); }
  }, [buf, opts, player, renderMode]);

  const autoTune = useCallback(async () => {
    if (!buf) { toast("warn", "Chargez d'abord un audio à améliorer."); return; }
    const data = monoData(buf);
    const snr = estimateSnr(data, buf.sampleRate);
    const { f0 } = computeF0(data, buf.sampleRate);
    const next: EnhanceOpts = {
      ...opts,
      gainDb: clampN(1.8, -12, 12),
      gate: snr < 18 ? 0.6 : snr < 28 ? 0.3 : 0.12,
      brightDb: f0 && f0 < 150 ? 1.8 : 0.8,
      warmDb: f0 && f0 > 200 ? 1.4 : 0.6,
      compThreshold: -24,
      reverbWet: 0.05,
      detuneCents: 0, speed: 1,
    };
    setOpts(next);
    setMode((m) => (m === "manuel" ? "hybride" : m));
    log("fix", "Forgeron", `Amélioration automatique calculée : SNR ${Math.round(snr)} dB → porte ${Math.round(next.gate * 100)} % · F0 ${f0 ? Math.round(f0) : "n/d"} Hz → EQ chaleureuse/brillante adaptée · compression douce -24 dB.`);
    toast("ok", "Réglages automatiques appliqués — écoutez en B, ajustez si besoin (mode hybride).");
  }, [buf, opts, log, toast]);

  const saveFinal = useCallback(async () => {
    const rendered = await renderMode(opts);
    if (!rendered) return;
    try {
      const blob = encodeWav(rendered, 16);
      const data = monoData(rendered);
      const { f0 } = computeF0(data, rendered.sampleRate);
      await addProfile({
        name: finalName.trim() || `Enregistrement final — ${new Date().toLocaleDateString("fr-FR")}`,
        tags: ["final", "améliorée"],
        source: "améliorée",
        lang: settings.defaultLang,
        duration: rendered.duration,
        quality: 92, grade: "Excellent",
        f0, snr: 40, centroid: 0, syllRate: 0,
        sampleRate: rendered.sampleRate,
        features: [],
        note: `Validée depuis l'Améliorateur (source : ${origin || name})`,
      }, blob);
      toast("ok", "Voix validée enregistrée dans la bibliothèque !");
      log("ok", "améliorateur", "« Enregistrement final » validé et ajouté à la bibliothèque avec métadonnées complètes.");
      setTimeout(() => nav("library"), 700);
    } catch { toast("err", "Impossible d'enregistrer (stockage local indisponible)."); }
  }, [opts, renderMode, addProfile, finalName, origin, name, settings.defaultLang, toast, log, nav]);

  const exportWav = useCallback(async () => {
    const rendered = await renderMode(opts);
    if (!rendered) return;
    const rs = await resampleBuffer(rendered, settings.wavSr);
    downloadBlob(`supervoxforge_ameliore_${Date.now()}.wav`, encodeWav(rs, settings.wavBits));
    toast("ok", `Export master WAV ${settings.wavBits} bits / ${(settings.wavSr / 1000).toFixed(1)} kHz.`);
  }, [opts, renderMode, settings, toast]);

  const set = (patch: Partial<EnhanceOpts>) => { setOpts((o) => ({ ...o, ...patch })); if (mode === "auto") setMode("hybride"); };

  return (
    <div>
      <PageHead icon="sliders" title="Améliorateur vocal (Voice Enhancer)"
        sub="Après chaque génération ou conversion : amélioration automatique par le Forgeron, réglages manuels fins, ou mode hybride — avec comparaison A/B en temps réel et enregistrement de la voix validée." />

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-5">
          <div className="svf-panel p-4">
            <h3 className="font-mono text-[9px] uppercase tracking-[0.18em] text-dim">Source à améliorer</h3>
            <input ref={fileRef} type="file" accept="audio/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0] ?? undefined)} />
            <div className="mt-2 grid gap-2">
              <Btn variant="outline" icon="upload" onClick={() => fileRef.current?.click()}>Importer un fichier audio</Btn>
              {profiles.length > 0 && (
                <select defaultValue="" onChange={(e) => { if (e.target.value) loadProfileSample(e.target.value); e.target.value = ""; }}
                  className="h-10 rounded-lg border border-line2 bg-bg/60 px-3 text-xs text-txt outline-none focus:border-ember">
                  <option value="" disabled>…ou charger un échantillon de la bibliothèque</option>
                  {profiles.map((p) => <option key={p.id} value={p.id}>{p.name} — {fmtDur(p.duration)}</option>)}
                </select>
              )}
            </div>
            <p className="mt-2 text-[10.5px] leading-relaxed text-dim">Astuce : depuis la Conversion V→V, le bouton « Continuer dans l'Améliorateur » envoie directement le résultat ici.</p>
          </div>

          <div className="svf-panel p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-mono text-[9px] uppercase tracking-[0.18em] text-dim">Mode d'amélioration</h3>
              <Seg options={[{ v: "auto" as const, label: "Auto" }, { v: "manuel" as const, label: "Manuel" }, { v: "hybride" as const, label: "Hybride" }]} value={mode} onChange={setMode} />
            </div>
            <Btn variant="teal" icon="spark" className="w-full" onClick={autoTune} disabled={!buf || busy}>
              Amélioration automatique (IA locale)
            </Btn>
            <p className="mt-2 text-[10.5px] leading-relaxed text-dim">
              {mode === "auto" && "L'agent analyse SNR, F0 et spectre puis applique les corrections optimales."}
              {mode === "manuel" && "Vous gardez la main sur chaque paramètre."}
              {mode === "hybride" && "Base automatique + ajustements manuels : le meilleur des deux."}
            </p>
            <div className={`mt-3 space-y-3.5 transition-opacity ${mode === "auto" ? "pointer-events-none opacity-40" : ""}`}>
              <Slider label="Hauteur (pitch)" value={opts.detuneCents} min={-700} max={700} step={10} onChange={(v) => set({ detuneCents: v })} fmt={(v) => (v >= 0 ? "+" : "") + v + " c"} accent />
              <Slider label="Vitesse" value={opts.speed} min={0.5} max={1.5} step={0.02} onChange={(v) => set({ speed: v })} fmt={(v) => v.toFixed(2) + "×"} />
              <Slider label="Chaleur (graves)" value={opts.warmDb} min={-6} max={6} step={0.2} onChange={(v) => set({ warmDb: v })} fmt={(v) => (v >= 0 ? "+" : "") + v.toFixed(1) + " dB"} />
              <Slider label="Brillance (aigus)" value={opts.brightDb} min={-6} max={6} step={0.2} onChange={(v) => set({ brightDb: v })} fmt={(v) => (v >= 0 ? "+" : "") + v.toFixed(1) + " dB"} />
              <Slider label="Débruitage" value={opts.gate} min={0} max={1} step={0.02} onChange={(v) => set({ gate: v })} fmt={(v) => Math.round(v * 100) + " %"} />
              <Slider label="Compression" value={opts.compThreshold} min={-40} max={0} step={1} onChange={(v) => set({ compThreshold: v })} fmt={(v) => v + " dB"} />
              <Slider label="Réverbération" value={opts.reverbWet} min={0} max={0.5} step={0.01} onChange={(v) => set({ reverbWet: v })} fmt={(v) => Math.round(v * 100) + " %"} />
              <Slider label="Gain de sortie" value={opts.gainDb} min={-12} max={12} step={0.2} onChange={(v) => set({ gainDb: v })} fmt={(v) => (v >= 0 ? "+" : "") + v.toFixed(1) + " dB"} />
            </div>
          </div>
        </div>

        <div className="space-y-4 lg:col-span-7">
          <div className="svf-panel p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-txt">{name || "Aucune source"}</h3>
                <p className="font-mono text-[9px] uppercase tracking-widest text-dim">{origin ? `origine : ${origin}` : "chargez un audio pour commencer"}{buf ? ` · ${fmtDur(buf.duration)}` : ""}</p>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[10px] text-dim">A/B :</span>
                <button onClick={() => playAb("A")} className={`btn-press rounded-lg border px-3.5 py-1.5 font-display text-xs font-bold ${ab === "A" ? "border-line2 bg-panel2 text-txt" : "border-line text-dim hover:text-txt"}`}>A · originale</button>
                <button onClick={() => playAb("B")} className={`btn-press rounded-lg border px-3.5 py-1.5 font-display text-xs font-bold ${ab === "B" ? "border-ember bg-ember/12 text-ember2" : "border-line text-dim hover:text-ember2"}`}>B · améliorée</button>
              </div>
            </div>
            {!buf ? (
              <div className="mt-3"><Empty icon="sliders" title="Rien à améliorer pour l'instant" desc="Importez un fichier, un échantillon de la bibliothèque, ou envoyez un résultat de conversion." /></div>
            ) : (
              <>
                <div className="mt-3 rounded-xl border border-line bg-bg/60 p-3">
                  <Waveform peaks={peaks} height={110} progress={player.duration ? player.position / player.duration : 0} onSeek={(f) => player.seek(f)} />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Btn icon={player.state === "playing" ? "pause" : "play"} onClick={() => player.toggle()}>{player.state === "playing" ? "Pause" : `Lire ${ab === "A" ? "l'originale" : "l'améliorée"}`}</Btn>
                  <Btn variant="ghost" icon="stop" onClick={() => player.stop()}>Stop</Btn>
                  {busy && <span className="flex items-center gap-1.5 font-mono text-[10px] text-ember2"><Icon name="refresh" size={12} className="spin" /> rendu en cours…</span>}
                  <span className="ml-auto font-mono text-[11px] tabular-nums text-mut">{fmtTime(player.position)} / {fmtTime(player.duration)}</span>
                </div>
              </>
            )}
          </div>

          <div className="svf-panel p-4">
            <h3 className="font-mono text-[9px] uppercase tracking-[0.18em] text-dim">Validation finale</h3>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input value={finalName} onChange={(e) => setFinalName(e.target.value)} placeholder={`Enregistrement final — ${new Date().toLocaleDateString("fr-FR")}`}
                className="h-11 flex-1 rounded-lg border border-line2 bg-bg/60 px-3 text-sm text-txt outline-none focus:border-ember" />
            </div>
            <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
              <Btn size="lg" icon="check" disabled={!buf || busy} onClick={saveFinal}>ENREGISTRER LA VOIX VALIDÉE</Btn>
              <Btn size="lg" variant="teal" icon="download" disabled={!buf || busy} onClick={exportWav}>Exporter le master WAV</Btn>
            </div>
            <p className="mt-2 text-[10.5px] leading-relaxed text-dim">
              La voix validée est renommée « Enregistrement final », ajoutée à la bibliothèque avec métadonnées complètes (F0, durée, source, tags) — et peut ensuite servir de voix de synthèse calibrée.
            </p>
          </div>

          <HintBar>Comparaison rapide : cliquez sur <strong>A</strong> pour l'originale, <strong>B</strong> pour la version améliorée — la forme d'onde et le rendu se mettent à jour à chaque lecture. Le débruitage et la compression sont appliqués au rendu (moteur hors-ligne 32 bits flottants).</HintBar>
        </div>
      </div>
    </div>
  );
}
