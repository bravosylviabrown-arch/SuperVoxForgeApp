import React, { useEffect, useMemo, useState } from "react";
import { useApp } from "../state/store";
import { tts, LANGS } from "../lib/tts";
import { idbGet, decodeBlob, peaksOf, monoData, fmtDur, colorOf } from "../lib/audio";
import { Btn, Icon, ForgeLogo, Waveform, usePlayer, Empty, Reveal, Kbd } from "../ui";

function EqBars({ n = 26, h = 74 }: { n?: number; h?: number }) {
  const bars = useMemo(() => Array.from({ length: n }, (_, i) => ({
    d: 0.7 + ((i * 37) % 10) / 9,
    delay: ((i * 53) % 10) / 8,
    max: 0.35 + ((i * 29) % 10) / 14,
  })), [n]);
  return (
    <div className="flex items-end justify-center gap-[3px]" style={{ height: h }} aria-hidden>
      {bars.map((b, i) => (
        <span key={i} className="eq-bar w-[4px] rounded-full"
          style={{ height: h * b.max, animationDuration: b.d + "s", animationDelay: b.delay + "s", background: i % 5 === 0 ? "var(--svf-teal)" : "var(--svf-ember)", opacity: 0.85 }} />
      ))}
    </div>
  );
}

function RecentProfiles() {
  const { profiles, nav } = useApp();
  const player = usePlayer();
  const [peaks, setPeaks] = useState<Float32Array | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [current, setCurrent] = useState<string | null>(null);

  const play = async (id: string) => {
    const p = profiles.find((x) => x.id === id);
    if (!p) return;
    if (current === id && player.state === "playing") { player.stop(); setCurrent(null); setPeaks(null); return; }
    setLoadingId(id);
    try {
      const blob = await idbGet(p.sampleKey);
      if (!blob) throw new Error("introuvable");
      const buf = await decodeBlob(blob);
      setPeaks(peaksOf(monoData(buf), 160));
      player.load(buf);
      player.play();
      setCurrent(id);
    } catch { /* silencieux */ }
    setLoadingId(null);
  };

  if (!profiles.length)
    return (
      <Empty icon="mic" title="Aucune voix forgée pour l'instant"
        desc="Importez un fichier audio ou enregistrez 20 secondes au micro : la forge en extrait la signature acoustique."
        action={<Btn size="sm" variant="outline" icon="mic" onClick={() => nav("clone")}>Cloner ma première voix</Btn>} />
    );
  return (
    <div>
      {profiles.slice(0, 3).map((p) => (
        <button key={p.id} onClick={() => play(p.id)}
          className="btn-press group mb-1.5 flex w-full items-center gap-3 rounded-lg border border-line bg-panel2 px-3 py-2 text-left hover:border-ember/40">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-display text-[11px] font-bold text-[#12100c]" style={{ background: colorOf(p.id) }}>
            {p.name.slice(0, 2).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold text-txt">{p.name}</span>
            <span className="block font-mono text-[10px] text-dim">{fmtDur(p.duration)} · {p.grade} · {p.f0 ? Math.round(p.f0) + " Hz" : "F0 n/d"}</span>
          </span>
          {loadingId === p.id ? <Icon name="refresh" size={15} className="spin text-ember" />
            : <Icon name={current === p.id && player.state === "playing" ? "stop" : "play"} size={15} className="text-dim group-hover:text-ember" />}
        </button>
      ))}
      {current && <div className="mt-2"><Waveform peaks={peaks} progress={player.duration ? player.position / player.duration : 0} height={52} dim /></div>}
      <button onClick={() => nav("library")} className="btn-press mt-2 flex items-center gap-1 text-xs font-medium text-ember2 hover:text-ember">
        Toute la bibliothèque <Icon name="chevR" size={13} />
      </button>
    </div>
  );
}

export default function StudioPage() {
  const { nav, logs, online, voicesTick, profiles, runDiag, diagRunning, canInstall, promptInstall } = useApp();
  void voicesTick;
  const coverage = useMemo(() => tts.coverage(), [voicesTick]); // eslint-disable-line
  const totalVoices = tts.voices.length;
  const lastLogs = logs.slice(-4).reverse();
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Bonjour" : hour < 18 ? "Bon après-midi" : "Bonsoir";

  const tiles: { id: any; icon: string; title: string; desc: string; span: string; key: string }[] = [
    { id: "clone", icon: "mic", title: "Cloner une voix", desc: "Fichier audio ou micro, 5 s à 5 min+, analyse qualité en direct.", span: "sm:col-span-2", key: "2" },
    { id: "synth", icon: "wave", title: "Synthèse vocale", desc: "Texte → parole naturelle, voix clonée calibrée, 6 langues.", span: "", key: "3" },
    { id: "translate", icon: "translate", title: "Traduction", desc: "6 langues, traduction réelle puis lecture à voix haute.", span: "", key: "4" },
    { id: "convert", icon: "swap", title: "Conversion V→V", desc: "Transpose une voix source vers votre voix clonée.", span: "", key: "5" },
    { id: "enhancer", icon: "sliders", title: "Améliorateur", desc: "Auto, manuel ou hybride — comparaison A/B, export master.", span: "", key: "6" },
    { id: "library", icon: "library", title: "Bibliothèque", desc: "Profils, tags, recherche, aperçu, exports illimités.", span: "sm:col-span-2", key: "7" },
  ];

  return (
    <div>
      {/* bandeau statut */}
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {[
          { icon: "cpu", label: "Moteur neuronal", val: tts.supported() ? "ACTIF" : "INDISPONIBLE", sub: "natif navigateur · zéro espeak-ng", tone: tts.supported() ? "text-teal" : "text-err" },
          { icon: "wave", label: "Voix détectées", val: String(totalVoices), sub: "Natural / Google / locales", tone: "text-ember2" },
          { icon: "mic", label: "Profils forgés", val: String(profiles.length), sub: "stockage local illimité", tone: "text-ember2" },
          { icon: online ? "wifi" : "wifioff", label: "Réseau", val: online ? "CLOUD OK" : "LOCAL", sub: online ? "traduction + voix cloud" : "synthèse 100% hors ligne", tone: online ? "text-teal" : "text-warn" },
        ].map((s, i) => (
          <Reveal key={s.label} delay={i * 70}>
            <div className="svf-panel card-hover px-4 py-3.5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-dim">{s.label}</span>
                <Icon name={s.icon} size={15} className="text-dim" />
              </div>
              <p className={`mt-1 font-display text-lg font-bold tracking-tight ${s.tone}`}>{s.val}</p>
              <p className="font-mono text-[10px] text-dim">{s.sub}</p>
            </div>
          </Reveal>
        ))}
      </div>

      {/* console principale */}
      <div className="mt-4 grid gap-4 lg:grid-cols-12">
        <Reveal className="lg:col-span-7">
          <section className="svf-panel relative overflow-hidden p-6 sm:p-8">
            <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-ember/10 blur-3xl" />
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-ember">{greet} — la forge est chaude</p>
            <h1 className="mt-2 font-display text-3xl font-bold leading-[1.06] tracking-tight text-txt sm:text-[42px]">
              FORGEZ UNE VOIX.<br />
              <span className="text-glow text-ember">SYNTHÉTISEZ TOUT.</span>
            </h1>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-mut">
              Clonage, synthèse naturalisée, traduction, conversion et amélioration — tout s'exécute
              <strong className="text-txt"> sur votre appareil</strong>. Gratuit, illimité, aucune dépendance espeak-ng.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-2.5">
              <Btn size="lg" icon="mic" onClick={() => nav("clone")}>Cloner une voix</Btn>
              <Btn size="lg" variant="outline" icon="wave" onClick={() => nav("synth")}>Ouvrir la synthèse</Btn>
              <span className="ml-1 hidden items-center gap-1.5 font-mono text-[10px] text-dim sm:flex"><Kbd>2</Kbd>–<Kbd>7</Kbd> navigation rapide</span>
            </div>
            <div className="scanline mt-6 rounded-xl border border-line bg-bg/60 px-4 pb-2 pt-4">
              <EqBars />
              <div className="flex items-center justify-between pb-1 pt-2 font-mono text-[9px] uppercase tracking-[0.2em] text-dim">
                <span>prosodie · f0 · timbre</span><span className="text-teal">moteur prêt</span>
              </div>
            </div>
          </section>
        </Reveal>

        <Reveal delay={120} className="lg:col-span-5">
          <section className="svf-panel flex h-full flex-col p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-display text-xs font-bold uppercase tracking-[0.14em] text-txt">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-teal/12 text-teal"><Icon name="bot" size={14} /></span>
                Console du Forgeron
              </h3>
              <Btn size="sm" variant="ghost" icon="refresh" onClick={runDiag} disabled={diagRunning}>{diagRunning ? "Analyse…" : "Diagnostic"}</Btn>
            </div>
            <div className="min-h-[110px] flex-1 space-y-1.5">
              {lastLogs.length === 0 && <p className="text-xs text-dim">L'agent démarre son auto-diagnostic…</p>}
              {lastLogs.map((l) => (
                <div key={l.id} className="anim-fade flex items-start gap-2 rounded-lg bg-panel2 px-2.5 py-1.5 text-[11px] leading-snug">
                  <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${l.level === "ok" ? "bg-teal" : l.level === "err" ? "bg-err" : l.level === "fix" ? "bg-ember" : l.level === "warn" ? "bg-warn" : "bg-dim"}`} />
                  <span className="text-mut"><strong className="font-mono text-[9px] uppercase tracking-wider text-dim">[{l.src}]</strong> {l.msg}</span>
                </div>
              ))}
            </div>
            <button onClick={() => nav("assistant")} className="btn-press mt-3 flex items-center gap-1 self-start text-xs font-medium text-teal hover:brightness-125">
              Ouvrir l'agent <Icon name="chevR" size={13} />
            </button>
            <div className="mt-4 border-t border-line pt-4">
              <h4 className="mb-2 font-mono text-[9px] uppercase tracking-[0.18em] text-dim">Dernières voix</h4>
              <RecentProfiles />
            </div>
          </section>
        </Reveal>
      </div>

      {/* tuiles d'accès rapide */}
      <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        {tiles.map((t, i) => (
          <Reveal key={t.id} delay={i * 60} className={t.span}>
            <button onClick={() => nav(t.id)}
              className="svf-panel card-hover group flex h-full w-full items-start gap-3.5 p-4 text-left">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-ember/25 bg-ember/8 text-ember transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3">
                <Icon name={t.icon} size={19} />
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <span className="font-display text-[13px] font-bold text-txt">{t.title}</span>
                  <Kbd>{t.key}</Kbd>
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-mut">{t.desc}</span>
              </span>
              <Icon name="chevR" size={15} className="ml-auto mt-1 text-dim transition-transform duration-300 group-hover:translate-x-1 group-hover:text-ember" />
            </button>
          </Reveal>
        ))}
      </div>

      {/* étapes + installation */}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Reveal className="lg:col-span-2">
          <div className="svf-panel p-5">
            <h3 className="font-mono text-[9px] uppercase tracking-[0.2em] text-dim">En trois gestes</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {[
                { n: "01", t: "Donnez une voix", d: "Fichier WAV/MP3/M4A/FLAC… ou micro direct, 5 s à 5 min." },
                { n: "02", t: "La forge calibre", d: "Nettoyage, F0, timbre : une signature acoustique 87-dim est extraite." },
                { n: "03", t: "Créez & exportez", d: "Synthèse naturalisée, traduction, conversion, export WAV sans perte." },
              ].map((s, i) => (
                <div key={s.n} className="relative rounded-xl border border-line bg-panel2 p-4">
                  <span className="font-display text-2xl font-bold text-ember/35">{s.n}</span>
                  <p className="mt-1 font-display text-[13px] font-bold text-txt">{s.t}</p>
                  <p className="mt-1 text-xs leading-relaxed text-mut">{s.d}</p>
                  {i < 2 && <Icon name="chevR" size={14} className="absolute -right-3 top-1/2 hidden -translate-y-1/2 text-dim sm:block" />}
                </div>
              ))}
            </div>
          </div>
        </Reveal>
        <Reveal delay={140}>
          <div className="svf-panel flex h-full flex-col justify-between p-5">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal/12 text-teal"><Icon name="install" size={17} /></span>
                <div>
                  <h3 className="font-display text-[13px] font-bold text-txt">Sur PC & smartphone</h3>
                  <p className="font-mono text-[9px] uppercase tracking-widest text-dim">application installable (PWA)</p>
                </div>
              </div>
              <p className="mt-2.5 text-xs leading-relaxed text-mut">
                Installez SuperVoxForge comme une vraie application : menu <strong className="text-txt">⋮ → Installer</strong> sur Chrome/Edge (Windows, macOS, Linux) ou <strong className="text-txt">Ajouter à l'écran d'accueil</strong> sur Android. Fonctionne ensuite hors ligne.
              </p>
            </div>
            <Btn className="mt-3" variant="teal" icon="install" onClick={promptInstall}>{canInstall ? "Installer maintenant" : "Voir la procédure"}</Btn>
          </div>
        </Reveal>
      </div>

      {/* couverture linguistique */}
      <Reveal>
        <div className="svf-panel mt-4 flex flex-wrap items-center gap-2 px-4 py-3">
          <span className="mr-1 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-dim"><Icon name="globe" size={13} className="text-ember" /> Couverture 6 langues</span>
          {coverage.map((c) => {
            const l = LANGS.find((x) => x.code === c.lang)!;
            return (
              <span key={c.lang} className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] ${c.count ? "border-line2 text-mut" : "border-ember/40 text-ember2"}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${c.count ? "bg-teal" : "bg-ember"} pulse-dot`} />
                {l.short} · {c.count ? `${c.count} voix` : "repli auto"}
              </span>
            );
          })}
          <span className="ml-auto hidden font-mono text-[9px] text-dim md:block">repli automatique géré par le Forgeron</span>
        </div>
      </Reveal>

      <div className="mt-6 flex items-center gap-2 text-dim">
        <ForgeLogo size={16} />
        <p className="font-mono text-[10px]">Astuce : sur Chrome et Edge, les voix « Natural » et « Google » offrent un réalisme proche des meilleurs services payants — sélection automatique par score de qualité.</p>
      </div>
    </div>
  );
}
