import React, { useEffect } from "react";
import { AppProvider, useApp, type PageId } from "./state/store";
import { Shell } from "./shell";
import { AmbientCanvas, Icon } from "./ui";
import StudioPage from "./pages/StudioPage";
import ClonePage from "./pages/ClonePage";
import SynthPage from "./pages/SynthPage";
import { ConvertPage, TranslatePage, EnhancerPage } from "./pages/ToolsPages";
import LibraryPage from "./pages/LibraryPage";
import { AssistantPage, GuidePage, SettingsPage } from "./pages/SystemPages";

const KEYMAP: Record<string, PageId> = {
  "1": "studio", "2": "clone", "3": "synth", "4": "translate", "5": "convert",
  "6": "enhancer", "7": "library", "8": "assistant", "9": "guide", "0": "settings",
};

function ToastHost() {
  const { toasts } = useApp();
  const iconOf = { ok: "check", err: "alert", warn: "alert", info: "bot" } as const;
  const colorOf = { ok: "border-teal/40 text-teal", err: "border-err/40 text-err", warn: "border-warn/40 text-warn", info: "border-line2 text-mut" } as const;
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(380px,90vw)] flex-col gap-2">
      {toasts.map((t) => (
        <div key={t.id} className={`anim-slide-in pointer-events-auto flex items-start gap-2.5 rounded-xl border bg-panel px-3.5 py-2.5 shadow-2xl ${colorOf[t.kind]}`}>
          <Icon name={iconOf[t.kind]} size={15} className="mt-0.5 shrink-0" />
          <p className="text-[12.5px] leading-snug text-txt">{t.msg}</p>
        </div>
      ))}
    </div>
  );
}

function Pages() {
  const { page } = useApp();
  switch (page) {
    case "clone": return <ClonePage />;
    case "synth": return <SynthPage />;
    case "translate": return <TranslatePage />;
    case "convert": return <ConvertPage />;
    case "enhancer": return <EnhancerPage />;
    case "library": return <LibraryPage />;
    case "assistant": return <AssistantPage />;
    case "guide": return <GuidePage />;
    case "settings": return <SettingsPage />;
    default: return <StudioPage />;
  }
}

function Shortcuts() {
  const { nav } = useApp();
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      const p = KEYMAP[e.key];
      if (p) { e.preventDefault(); nav(p); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [nav]);
  return null;
}

export default function App() {
  return (
    <AppProvider>
      <AmbientCanvas />
      <Shell>
        <Pages />
      </Shell>
      <ToastHost />
      <Shortcuts />
    </AppProvider>
  );
}
