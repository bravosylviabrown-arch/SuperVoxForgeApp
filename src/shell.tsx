import React, { useState } from "react";
import { useApp, type PageId } from "./state/store";
import { tts } from "./lib/tts";
import { ForgeLogo, Icon } from "./ui";

const NAV: { id: PageId; label: string; icon: string; group: string }[] = [
  { id: "studio", label: "Studio", icon: "logo", group: "Créer" },
  { id: "clone", label: "Clonage vocal", icon: "mic", group: "Créer" },
  { id: "synth", label: "Synthèse vocale", icon: "wave", group: "Créer" },
  { id: "translate", label: "Traduction", icon: "translate", group: "Créer" },
  { id: "convert", label: "Conversion V→V", icon: "swap", group: "Outils" },
  { id: "enhancer", label: "Améliorateur", icon: "sliders", group: "Outils" },
  { id: "library", label: "Bibliothèque", icon: "library", group: "Outils" },
  { id: "assistant", label: "Forgeron · Agent IA", icon: "bot", group: "Système" },
  { id: "guide", label: "Guide & documents", icon: "book", group: "Système" },
  { id: "settings", label: "Paramètres", icon: "gear", group: "Système" },
];

export const PAGE_TITLES: Record<PageId, string> = {
  studio: "Studio", clone: "Clonage vocal", synth: "Synthèse vocale", translate: "Traduction",
  convert: "Conversion voix-à-voix", enhancer: "Améliorateur vocal", library: "Bibliothèque de voix",
  assistant: "Forgeron — agent autonome", guide: "Guide & documents", settings: "Paramètres",
};

function NavItems({ onNav }: { onNav?: () => void }) {
  const { page, nav } = useApp();
  const groups = ["Créer", "Outils", "Système"];
  return (
    <nav className="flex-1 overflow-y-auto px-3 pb-4">
      {groups.map((gr) => (
        <div key={gr} className="mt-4">
          <p className="px-2 pb-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-dim">{gr}</p>
          {NAV.filter((n) => n.group === gr).map((n) => {
            const active = page === n.id;
            return (
              <button key={n.id} onClick={() => { nav(n.id); onNav?.(); }}
                className={`btn-press group mb-0.5 flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors ${active ? "bg-ember/12 text-ember2" : "text-mut hover:bg-panel2 hover:text-txt"}`}>
                <span className={`relative ${active ? "text-ember" : "text-dim group-hover:text-mut"}`}>
                  {n.icon === "logo" ? <ForgeLogo size={17} /> : <Icon name={n.icon} size={16} />}
                  {active && <span className="absolute -left-2 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full bg-ember" />}
                </span>
                {n.label}
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const { online, voicesTick, logs, nav, page, canInstall, promptInstall, settings, setSettings } = useApp();
  const [drawer, setDrawer] = useState(false);
  void voicesTick;
  const voiceCount = tts.voices.length;
  const lastLog = logs[logs.length - 1];

  const sidebar = (
    <>
      <div className="flex items-center gap-2.5 px-4 pb-2 pt-5">
        <ForgeLogo size={32} />
        <div>
          <p className="font-display text-[13px] font-bold leading-tight tracking-wide text-txt">SUPERVOX<span className="text-ember">FORGE</span></p>
          <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-dim">Studio vocal · v2.6</p>
        </div>
      </div>
      <NavItems onNav={() => setDrawer(false)} />
      <div className="border-t border-line px-4 py-3">
        <div className="flex items-center justify-between text-[11px]">
          <span className="flex items-center gap-1.5 text-mut">
            <span className={`h-1.5 w-1.5 rounded-full ${online ? "bg-teal" : "bg-warn"} pulse-dot`} />
            {online ? "En ligne" : "Hors ligne"}
          </span>
          <button onClick={() => setSettings({ theme: settings.theme === "dark" ? "light" : "dark" })}
            className="btn-press rounded-md px-2 py-1 font-mono text-[10px] text-dim hover:bg-panel2 hover:text-txt" title="Basculer le thème">
            {settings.theme === "dark" ? "SOMBRE" : "CLAIR"}
          </button>
        </div>
        <p className="mt-1.5 font-mono text-[9px] leading-relaxed text-dim">Local-first · gratuit · illimité<br />Aucune donnée envoyée sans consentement</p>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen">
      {/* Sidebar desktop */}
      <aside className="sticky top-0 hidden h-screen w-[228px] shrink-0 flex-col border-r border-line bg-panel/70 backdrop-blur lg:flex">
        {sidebar}
      </aside>

      {/* Drawer mobile */}
      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="anim-fade absolute inset-0 bg-black/60" onClick={() => setDrawer(false)} />
          <aside className="anim-slide-in absolute left-0 top-0 flex h-full w-[248px] flex-col border-r border-line bg-panel shadow-2xl">
            <button className="absolute right-3 top-4 rounded-md p-1.5 text-mut hover:text-txt" onClick={() => setDrawer(false)} aria-label="Fermer le menu"><Icon name="x" size={16} /></button>
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-[1160px] items-center gap-3 px-4 sm:px-6">
            <button className="btn-press rounded-lg border border-line p-2 text-mut hover:text-txt lg:hidden" onClick={() => setDrawer(true)} aria-label="Menu">
              <Icon name="sliders" size={16} />
            </button>
            <h2 className="font-display text-sm font-bold tracking-wide text-txt">{PAGE_TITLES[page]}</h2>
            <div className="ml-auto flex items-center gap-2">
              <span className="hidden items-center gap-1.5 rounded-full border border-line px-2.5 py-1 font-mono text-[10px] text-mut sm:flex" title="Voix neuronales détectées dans le navigateur">
                <Icon name="wave" size={12} className="text-ember" /> {voiceCount} voix
              </span>
              <span className={`hidden items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] md:flex ${online ? "border-teal/30 text-teal" : "border-warn/30 text-warn"}`}>
                <Icon name={online ? "wifi" : "wifioff"} size={12} /> {online ? "Cloud OK" : "100% local"}
              </span>
              <button onClick={() => nav("assistant")} className="btn-press relative flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 font-mono text-[10px] text-mut hover:border-teal/40 hover:text-teal" title={lastLog ? lastLog.msg : "Agent"}>
                <span className="h-1.5 w-1.5 rounded-full bg-teal pulse-dot" /> Forgeron
              </button>
              {canInstall && (
                <button onClick={promptInstall} className="btn-press hidden items-center gap-1.5 rounded-full bg-ember px-3 py-1.5 text-[11px] font-semibold text-[#1c0e02] hover:bg-ember2 sm:flex">
                  <Icon name="install" size={13} /> Installer l'app
                </button>
              )}
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1160px] flex-1 px-4 py-6 sm:px-6 sm:py-8">
          <div key={page} className="page-enter">{children}</div>
        </main>
        <footer className="border-t border-line py-4">
          <p className="mx-auto max-w-[1160px] px-6 font-mono text-[10px] text-dim">
            SuperVoxForge — moteur neuronal natif du navigateur (zéro espeak-ng) · traitement 100% local · RGPD : vos voix ne quittent jamais votre appareil sans votre action.
          </p>
        </footer>
      </div>
    </div>
  );
}
