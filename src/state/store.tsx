import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { tts, type LangCode } from "../lib/tts";
import { idbDel, idbPut, uid, type Grade } from "../lib/audio";
import { runDiagnostics, entry, type LogEntry, type LogLevel } from "../lib/agent";

export type PageId =
  | "studio" | "synth" | "clone" | "convert" | "translate"
  | "library" | "enhancer" | "assistant" | "guide" | "settings";

export interface Profile {
  id: string;
  name: string;
  tags: string[];
  source: "fichier" | "micro" | "améliorée" | "convertie";
  createdAt: number;
  lang: LangCode;
  duration: number;
  quality: number;
  grade: Grade;
  f0: number | null;
  snr: number;
  centroid: number;
  syllRate: number;
  sampleRate: number;
  sampleKey: string;
  features: number[];
  note?: string;
}

export interface Settings {
  theme: "dark" | "light";
  defaultLang: LangCode;
  humanize: boolean;
  defaultRate: number;
  defaultPitchSt: number;
  wavBits: 16 | 24 | 32;
  wavSr: 44100 | 48000 | 96000;
  openRouterKey: string;
  nvidiaKey: string;
  reduceMotion: boolean;
  largeText: boolean;
  agentWatchdog: boolean;
  agentTradFallback: boolean;
  agentQualityHints: boolean;
}

export interface Toast { id: string; kind: "ok" | "err" | "info" | "warn"; msg: string; }
export interface AudioSlot { name: string; buffer: AudioBuffer; origin: string; }

const DEFAULT_SETTINGS: Settings = {
  theme: "dark", defaultLang: "fr-FR", humanize: true, defaultRate: 1, defaultPitchSt: 0,
  wavBits: 16, wavSr: 44100, openRouterKey: "", nvidiaKey: "", reduceMotion: false, largeText: false,
  agentWatchdog: true, agentTradFallback: true, agentQualityHints: true,
};

interface Ctx {
  page: PageId;
  nav: (p: PageId) => void;
  profiles: Profile[];
  addProfile: (p: Omit<Profile, "id" | "createdAt" | "sampleKey">, blob: Blob) => Promise<Profile>;
  updateProfile: (id: string, patch: Partial<Profile>) => void;
  removeProfile: (id: string) => Promise<void>;
  duplicateProfile: (id: string) => Promise<void>;
  settings: Settings;
  setSettings: (patch: Partial<Settings>) => void;
  toasts: Toast[];
  toast: (kind: Toast["kind"], msg: string) => void;
  logs: LogEntry[];
  log: (level: LogLevel, src: string, msg: string) => void;
  clearLogs: () => void;
  diagRunning: boolean;
  runDiag: () => Promise<void>;
  voicesTick: number;
  online: boolean;
  sessionText: string;
  sessionLang: LangCode;
  setSession: (patch: { text?: string; lang?: LangCode }) => void;
  slot: AudioSlot | null;
  setSlot: (s: AudioSlot | null) => void;
  canInstall: boolean;
  promptInstall: () => void;
}

const AppCtx = createContext<Ctx | null>(null);

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch { return fallback; }
}
function loadArr<T>(key: string): T[] {
  try { return JSON.parse(localStorage.getItem(key) || "[]") as T[]; } catch { return []; }
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [page, setPage] = useState<PageId>("studio");
  const [profiles, setProfiles] = useState<Profile[]>(() => loadArr<Profile>("svf-profiles"));
  const [settings, setSettingsState] = useState<Settings>(() => load("svf-settings", DEFAULT_SETTINGS));
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [diagRunning, setDiagRunning] = useState(false);
  const [voicesTick, setVoicesTick] = useState(0);
  const [online, setOnline] = useState(navigator.onLine);
  const [session, setSessionState] = useState(() => load("svf-session", { text: "", lang: DEFAULT_SETTINGS.defaultLang }));
  const [slot, setSlot] = useState<AudioSlot | null>(null);
  const [canInstall, setCanInstall] = useState(false);
  const installEvt = useRef<any>(null);

  useEffect(() => { localStorage.setItem("svf-profiles", JSON.stringify(profiles)); }, [profiles]);
  useEffect(() => { localStorage.setItem("svf-settings", JSON.stringify(settings)); }, [settings]);
  useEffect(() => { localStorage.setItem("svf-session", JSON.stringify(session)); }, [session]);

  useEffect(() => {
    tts.watchdogEnabled = settings.agentWatchdog;
  }, [settings.agentWatchdog]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", settings.theme);
    localStorage.setItem("svf-theme", settings.theme);
    document.documentElement.setAttribute("data-reduce-motion", settings.reduceMotion ? "1" : "0");
    localStorage.setItem("svf-reduce-motion", settings.reduceMotion ? "1" : "0");
    document.documentElement.setAttribute("data-large-text", settings.largeText ? "1" : "0");
  }, [settings.theme, settings.reduceMotion, settings.largeText]);

  const log = useCallback((level: LogLevel, src: string, msg: string) => {
    setLogs((l) => [...l.slice(-199), entry(level, src, msg)]);
  }, []);

  const toast = useCallback((kind: Toast["kind"], msg: string) => {
    const t = { id: uid(), kind, msg };
    setToasts((x) => [...x.slice(-3), t]);
    setTimeout(() => setToasts((x) => x.filter((y) => y.id !== t.id)), 4600);
  }, []);

  const runDiag = useCallback(async () => {
    setDiagRunning(true);
    log("info", "agent", "Diagnostic complet lancé par l'utilisateur…");
    try {
      const rep = await runDiagnostics(navigator.onLine);
      setLogs((l) => [...l, ...rep.entries].slice(-220));
      toast(rep.entries.some((e) => e.level === "err") ? "warn" : "ok", `Diagnostic terminé — ${rep.fixes} correction(s) automatique(s) appliquée(s).`);
    } finally { setDiagRunning(false); }
  }, [log, toast]);

  useEffect(() => {
    tts.init().then(() => setVoicesTick((t) => t + 1));
    const un = tts.subscribe(() => setVoicesTick((t) => t + 1));
    const on = () => { setOnline(true); log("ok", "réseau", "Connexion rétablie — moteurs cloud de nouveau disponibles."); };
    const off = () => { setOnline(false); log("warn", "réseau", "Passage hors ligne — bascule automatique sur le moteur 100% local."); };
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    const onBip = (e: any) => { installEvt.current = e; setCanInstall(true); };
    window.addEventListener("beforeinstallprompt", onBip);
    if ("serviceWorker" in navigator && !location.hostname.includes("localhost")) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    const boot = setTimeout(() => {
      runDiagnostics(navigator.onLine).then((rep) => setLogs((l) => [...l, ...rep.entries].slice(-220)));
    }, 900);
    return () => { un(); window.removeEventListener("online", on); window.removeEventListener("offline", off); window.removeEventListener("beforeinstallprompt", onBip); clearTimeout(boot); };
  }, [log]);

  const nav = useCallback((p: PageId) => { setPage(p); window.scrollTo({ top: 0 }); }, []);

  const addProfile = useCallback(async (p: Omit<Profile, "id" | "createdAt" | "sampleKey">, blob: Blob) => {
    const id = uid();
    const sampleKey = "sample-" + id;
    await idbPut(sampleKey, blob);
    const full: Profile = { ...p, id, createdAt: Date.now(), sampleKey };
    setProfiles((x) => [full, ...x]);
    log("ok", "bibliothèque", `Profil vocal « ${full.name} » créé (${full.grade}, ${full.quality}/100).`);
    return full;
  }, [log]);

  const updateProfile = useCallback((id: string, patch: Partial<Profile>) => {
    setProfiles((x) => x.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }, []);

  const removeProfile = useCallback(async (id: string) => {
    const p = profiles.find((x) => x.id === id);
    setProfiles((x) => x.filter((y) => y.id !== id));
    if (p) { await idbDel(p.sampleKey).catch(() => {}); log("info", "bibliothèque", `Profil « ${p.name} » supprimé (échantillon local effacé, conforme RGPD).`); }
  }, [profiles, log]);

  const duplicateProfile = useCallback(async (id: string) => {
    const p = profiles.find((x) => x.id === id);
    if (!p) return;
    const { idbGet } = await import("../lib/audio");
    const blob = await idbGet(p.sampleKey);
    if (!blob) { toast("err", "Échantillon audio introuvable."); return; }
    const nid = uid();
    await idbPut("sample-" + nid, blob);
    setProfiles((x) => [{ ...p, id: nid, name: p.name + " (copie)", createdAt: Date.now(), sampleKey: "sample-" + nid }, ...x]);
    toast("ok", `Profil « ${p.name} » dupliqué.`);
  }, [profiles, toast]);

  const setSettings = useCallback((patch: Partial<Settings>) => {
    setSettingsState((s) => ({ ...s, ...patch }));
  }, []);

  const setSession = useCallback((patch: { text?: string; lang?: LangCode }) => {
    setSessionState((s: { text: string; lang: LangCode }) => ({ ...s, ...patch }));
  }, []);

  const promptInstall = useCallback(() => {
    if (installEvt.current) { installEvt.current.prompt(); installEvt.current.userChoice.then((c: any) => { if (c?.outcome === "accepted") toast("ok", "SuperVoxForge installé ! Retrouvez-le dans vos applications."); }); setCanInstall(false); }
    else toast("info", "Sur Chrome/Edge : menu ⋮ → « Installer SuperVoxForge ». Sur Android : menu → « Ajouter à l'écran d'accueil ».");
  }, [toast]);

  const value = useMemo<Ctx>(() => ({
    page, nav, profiles, addProfile, updateProfile, removeProfile, duplicateProfile,
    settings, setSettings, toasts, toast, logs, log, clearLogs: () => setLogs([]),
    diagRunning, runDiag, voicesTick, online,
    sessionText: session.text, sessionLang: session.lang, setSession,
    slot, setSlot, canInstall, promptInstall,
  }), [page, nav, profiles, addProfile, updateProfile, removeProfile, duplicateProfile, settings, setSettings, toasts, toast, logs, log, diagRunning, runDiag, voicesTick, online, session, setSession, slot, canInstall, promptInstall]);

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp(): Ctx {
  const v = useContext(AppCtx);
  if (!v) throw new Error("useApp hors AppProvider");
  return v;
}
