import React, { useCallback, useEffect, useRef, useState } from "react";
import { getCtx } from "./lib/audio";

/* ================= ICÔNES (SVG inline, aucune dépendance) ================= */
const P: Record<string, React.ReactNode> = {
  logo: <><path d="M2.5 16.5 6 9l3 5.5L12 4l3 10.5 2.5-4 4 6" strokeWidth="2.1" /><path d="M3 20.5h18" strokeOpacity=".45" /></>,
  wave: <path d="M2 12h2l2-6 3 12 3-16 3 14 2.5-8L19 12h3" />,
  mic: <><rect x="9" y="2.5" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3.5M8.5 21.5h7" /></>,
  file: <><path d="M13 2.5H6.5A1.5 1.5 0 0 0 5 4v16a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 20V8.5L13 2.5Z" /><path d="M13 2.5V8.5H19M9 13l1.5 2L13 12l2.5 3.5" /></>,
  spark: <path d="M13 2 4.5 13.5H11L9.5 22 19 9.5h-6.5L13 2Z" />,
  translate: <><path d="m5 8 6 6M4 14l6-6 2-3M2 5h12M14.5 21l5-11 5 11M16.2 17.5h6.6" /></>,
  swap: <><path d="M16 3.5 20 7.5l-4 4M20 7.5H7M8 20.5l-4-4 4-4M4 16.5h13" /></>,
  library: <><path d="M4 19.5V5a1.5 1.5 0 0 1 1.5-1.5h13A1.5 1.5 0 0 1 20 5v14.5" /><path d="M2 19.5h20M8 3.5v16M15.5 3.5l2 16" /></>,
  sliders: <><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3" /><path d="M1.5 14h5M9.5 8h5M17.5 16h5" /></>,
  bot: <><rect x="4" y="8" width="16" height="11" rx="3" /><path d="M12 8V4.5M9 4.5h6" /><circle cx="9" cy="13" r="1" fill="currentColor" stroke="none" /><circle cx="15" cy="13" r="1" fill="currentColor" stroke="none" /><path d="M9.5 16.5h5" /></>,
  book: <><path d="M4 19.5V5A2.5 2.5 0 0 1 6.5 2.5H20v17H6.5A2.5 2.5 0 0 0 4 22" /><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1.11 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.09a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.09a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1Z" /></>,
  play: <path d="M7 4.5 19 12 7 19.5v-15Z" fill="currentColor" strokeWidth="1" />,
  pause: <path d="M7 4.5h3.4v15H7zM13.6 4.5H17v15h-3.4z" fill="currentColor" strokeWidth="1" />,
  stop: <rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor" strokeWidth="1" />,
  download: <><path d="M12 3v11M7.5 10 12 14.5 16.5 10" /><path d="M4 17v2.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V17" /></>,
  upload: <><path d="M12 14V3M7.5 7 12 2.5 16.5 7" /><path d="M4 17v2.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V17" /></>,
  trash: <><path d="M4 6.5h16M9.5 3.5h5M6 6.5 7 20a1.5 1.5 0 0 0 1.5 1.4h7A1.5 1.5 0 0 0 17 20l1-13.5" /><path d="M10 10.5v7M14 10.5v7" /></>,
  copy: <><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>,
  edit: <><path d="M17 3.5a2.1 2.1 0 0 1 3 3L8.5 18 4 19.5 5.5 15 17 3.5Z" /></>,
  tag: <><path d="M12.6 2.6 21 11a2 2 0 0 1 0 2.8l-6.2 6.2a2 2 0 0 1-2.8 0L3.6 11.6A2 2 0 0 1 3 10.2V5a2 2 0 0 1 2-2h5.2a2 2 0 0 1 1.4.6Z" /><circle cx="8" cy="8" r="1.4" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  check: <path d="m4.5 12.5 5 5L19.5 7" />,
  alert: <><path d="M10.3 3.6 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0Z" /><path d="M12 9v5M12 17.5h.01" /></>,
  globe: <><circle cx="12" cy="12" r="9.5" /><path d="M2.5 12h19M12 2.5c2.7 2.7 4 5.8 4 9.5s-1.3 6.8-4 9.5c-2.7-2.7-4-5.8-4-9.5s1.3-6.8 4-9.5Z" /></>,
  cpu: <><rect x="5" y="5" width="14" height="14" rx="2" /><rect x="9.5" y="9.5" width="5" height="5" /><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" /></>,
  cloud: <path d="M17.5 19.5a4.5 4.5 0 0 0 .4-9A7 7 0 0 0 4.3 12.7 4 4 0 0 0 6 19.5h11.5Z" />,
  wifi: <><path d="M2.5 8.5a15 15 0 0 1 19 0M5.5 12a10.5 10.5 0 0 1 13 0M8.5 15.4a6 6 0 0 1 7 0" /><circle cx="12" cy="19" r="1.2" fill="currentColor" stroke="none" /></>,
  wifioff: <><path d="M2.5 8.5a15 15 0 0 1 6.6-3.6M13 4.6a15 15 0 0 1 8.5 3.9M5.5 12a10.5 10.5 0 0 1 3.6-2.2M14.8 10.3a10.5 10.5 0 0 1 3.7 1.7M8.5 15.4a6 6 0 0 1 7 0" /><circle cx="12" cy="19" r="1.2" fill="currentColor" stroke="none" /><path d="M3 3l18 18" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  chevR: <path d="m9 5 7 7-7 7" />,
  chevD: <path d="m5 9 7 7 7-7" />,
  refresh: <><path d="M21 12a9 9 0 1 1-2.6-6.3" /><path d="M21 3v6h-6" /></>,
  shield: <><path d="M12 2.5 20 6v6c0 5-3.4 8.3-8 9.5C7.4 20.3 4 17 4 12V6l8-3.5Z" /><path d="m8.8 12 2.2 2.2 4.2-4.4" /></>,
  install: <><path d="M12 3v10M8 9.5l4 4 4-4" /><path d="M4 15v3.5A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5V15" /></>,
  heart: <path d="M12 20.5S3.5 15.5 3.5 9.3A4.8 4.8 0 0 1 12 6.4a4.8 4.8 0 0 1 8.5 2.9c0 6.2-8.5 11.2-8.5 11.2Z" />,
  key: <><circle cx="8" cy="15" r="4.5" /><path d="m11.2 11.8 8.3-8.3M17 6l2.5 2.5M14.5 8.5 17 11" /></>,
  folder: <path d="M3.5 6.5A1.5 1.5 0 0 1 5 5h4.5L12 7.5h7A1.5 1.5 0 0 1 20.5 9v9A1.5 1.5 0 0 1 19 19.5H5A1.5 1.5 0 0 1 3.5 18v-11.5Z" />,
  send: <path d="M21 3 3 10.5l7 2.5M21 3l-5 18-6-8M21 3 10 13" />,
  history: <><path d="M3.5 12a8.5 8.5 0 1 0 2.5-6L3.5 8.5" /><path d="M3.5 3.5v5h5M12 7.5V12l3 2" /></>,
};

export function Icon({ name, size = 18, className = "" }: { name: string; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={"shrink-0 " + className} aria-hidden>
      {P[name] ?? P.spark}
    </svg>
  );
}

export function ForgeLogo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <defs>
        <linearGradient id="svfg" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#ff5c2e" /><stop offset="1" stopColor="#ffb35c" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="22" height="22" rx="6" fill="url(#svfg)" fillOpacity="0.14" stroke="url(#svfg)" strokeWidth="1.2" />
      <path d="M4.5 15.5 7.5 9l2.6 4.6L12.5 5.5l2.4 8.1 1.8-2.9 2.8 4.8" stroke="url(#svfg)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 18.5h14" stroke="#37d6b8" strokeWidth="1.4" strokeLinecap="round" strokeOpacity="0.8" />
    </svg>
  );
}

/* ================= PRIMITIVES ================= */
type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "outline" | "ghost" | "danger" | "teal";
  size?: "sm" | "md" | "lg";
  icon?: string;
};
export function Btn({ variant = "primary", size = "md", icon, className = "", children, ...rest }: BtnProps) {
  const v = {
    primary: "bg-ember text-[#1c0e02] font-semibold hover:bg-ember2 ember-glow",
    teal: "bg-teal text-[#03211b] font-semibold hover:brightness-110",
    outline: "border border-line2 text-txt hover:border-ember hover:text-ember2 bg-transparent",
    ghost: "text-mut hover:text-txt hover:bg-panel2",
    danger: "border border-err/30 text-err hover:bg-err/10",
  }[variant];
  const s = { sm: "h-8 px-3 text-xs gap-1.5", md: "h-10 px-4 text-sm gap-2", lg: "h-12 px-6 text-[15px] gap-2.5" }[size];
  return (
    <button {...rest} className={`btn-press inline-flex items-center justify-center rounded-lg font-medium tracking-wide ${v} ${s} ${className}`}>
      {icon && <Icon name={icon} size={size === "sm" ? 14 : size === "lg" ? 19 : 16} />}
      {children}
    </button>
  );
}

export function Slider({ label, value, min, max, step, onChange, fmt, accent }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; fmt?: (v: number) => string; accent?: boolean;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-xs font-medium text-mut">{label}</span>
        <span className={`font-mono text-xs tabular-nums ${accent ? "text-ember2" : "text-txt"}`}>{fmt ? fmt(value) : value}</span>
      </div>
      <input type="range" className="svf-range" min={min} max={max} step={step} value={value}
        style={{ ["--fill" as any]: pct + "%" }}
        onChange={(e) => onChange(parseFloat(e.target.value))} aria-label={label} />
    </div>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
      className={`btn-press relative h-6 w-11 shrink-0 rounded-full border transition-colors ${on ? "border-ember bg-ember/80" : "border-line2 bg-panel2"}`}>
      <span className={`absolute top-0.5 h-[18px] w-[18px] rounded-full bg-txt shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

export function Chip({ active, onClick, children, className = "" }: { active?: boolean; onClick?: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button onClick={onClick} className={`btn-press h-8 rounded-full border px-3.5 text-xs font-medium tracking-wide ${active ? "border-ember bg-ember/12 text-ember2" : "border-line2 text-mut hover:border-line2 hover:text-txt"} ${className}`}>
      {children}
    </button>
  );
}

export function Seg<T extends string | number>({ options, value, onChange }: { options: { v: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-line bg-panel2 p-1">
      {options.map((o) => (
        <button key={o.v} onClick={() => onChange(o.v)}
          className={`btn-press rounded-md px-3 py-1.5 text-xs font-medium ${value === o.v ? "bg-ember/15 text-ember2 shadow-inner" : "text-mut hover:text-txt"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="anim-fade fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-[3px]" onMouseDown={onClose}>
      <div className={`svf-panel anim-fade-up w-full ${wide ? "max-w-2xl" : "max-w-md"} p-5 shadow-2xl`} onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-sm font-bold tracking-wide text-txt">{title}</h3>
          <button onClick={onClose} className="btn-press rounded-md p-1.5 text-mut hover:bg-panel2 hover:text-txt" aria-label="Fermer"><Icon name="x" size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function PageHead({ title, sub, icon }: { title: string; sub?: string; icon?: string }) {
  return (
    <header className="mb-6">
      <div className="flex items-center gap-3">
        {icon && <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-ember/30 bg-ember/10 text-ember"><Icon name={icon} size={19} /></span>}
        <div>
          <h1 className="font-display text-xl font-bold tracking-tight text-txt sm:text-2xl">{title}</h1>
          {sub && <p className="mt-0.5 max-w-2xl text-sm text-mut">{sub}</p>}
        </div>
      </div>
    </header>
  );
}

export function HintBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-teal/25 bg-teal/8 px-3.5 py-2.5 text-[13px] leading-relaxed text-teal">
      <Icon name="bot" size={16} className="mt-0.5" />
      <div>{children}</div>
    </div>
  );
}

export function Empty({ icon, title, desc, action }: { icon: string; title: string; desc: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line2 px-6 py-14 text-center">
      <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-panel2 text-dim"><Icon name={icon} size={26} /></span>
      <p className="font-display text-sm font-bold text-txt">{title}</p>
      <p className="mt-1 max-w-sm text-[13px] text-mut">{desc}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ================= LECTEUR AUDIO ================= */
export interface Player {
  state: "idle" | "playing" | "paused";
  duration: number;
  position: number;
  load: (buf: AudioBuffer) => void;
  play: (frac?: number) => void;
  toggle: () => void;
  stop: () => void;
  seek: (frac: number) => void;
}
export function usePlayer(onEnded?: () => void): Player {
  const [state, setState] = useState<Player["state"]>("idle");
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const buf = useRef<AudioBuffer | null>(null);
  const src = useRef<AudioBufferSourceNode | null>(null);
  const startedAt = useRef(0);
  const offset = useRef(0);
  const raf = useRef(0);
  const manualStop = useRef(false);
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;

  const kill = useCallback(() => {
    cancelAnimationFrame(raf.current);
    if (src.current) { try { src.current.onended = null; src.current.stop(); } catch { /* déjà stoppé */ } src.current.disconnect(); src.current = null; }
  }, []);

  const stop = useCallback(() => { manualStop.current = true; kill(); offset.current = 0; setPosition(0); setState("idle"); }, [kill]);

  const play = useCallback((frac?: number) => {
    if (!buf.current) return;
    kill();
    manualStop.current = false;
    const ctx = getCtx();
    const s = ctx.createBufferSource();
    s.buffer = buf.current;
    s.connect(ctx.destination);
    const from = frac !== undefined ? frac * buf.current.duration : offset.current;
    offset.current = from;
    s.start(0, from);
    startedAt.current = ctx.currentTime;
    src.current = s;
    setState("playing");
    s.onended = () => {
      if (manualStop.current) return;
      kill();
      offset.current = 0;
      setPosition(0);
      setState("idle");
      onEndedRef.current?.();
    };
    const tick = () => {
      if (!src.current) return;
      const p = offset.current + (getCtx().currentTime - startedAt.current);
      setPosition(Math.min(p, buf.current?.duration ?? p));
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  }, [kill]);

  const pause = useCallback(() => {
    if (!src.current || !buf.current) return;
    offset.current = Math.min(offset.current + (getCtx().currentTime - startedAt.current), buf.current.duration);
    manualStop.current = true;
    kill();
    setPosition(offset.current);
    setState("paused");
  }, [kill]);

  useEffect(() => () => kill(), [kill]);

  return {
    state, duration, position,
    load: (b: AudioBuffer) => { stop(); buf.current = b; setDuration(b.duration); },
    play: (frac) => play(frac),
    toggle: () => { if (state === "playing") pause(); else play(); },
    stop,
    seek: (frac) => {
      if (!buf.current) return;
      offset.current = frac * buf.current.duration;
      setPosition(offset.current);
      if (state === "playing") play(frac);
    },
  };
}

/* ================= WAVEFORM ================= */
export function Waveform({ peaks, progress = 0, onSeek, height = 88, dim }: {
  peaks: Float32Array | null; progress?: number; onSeek?: (frac: number) => void; height?: number; dim?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(300);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver((es) => setW(Math.max(60, es[0].contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = w * dpr; cv.height = height * dpr;
    const g = cv.getContext("2d")!;
    g.scale(dpr, dpr);
    g.clearRect(0, 0, w, height);
    const mid = height / 2;
    const n = peaks ? peaks.length / 2 : 0;
    const barW = Math.max(1.2, w / Math.max(60, n) - 1);
    const styles = getComputedStyle(document.documentElement);
    const ember = styles.getPropertyValue("--svf-ember").trim() || "#ff8a3d";
    const line2 = styles.getPropertyValue("--svf-line2").trim() || "#2b3b52";
    if (!n || !peaks) {
      g.strokeStyle = line2; g.lineWidth = 1.4; g.beginPath(); g.moveTo(0, mid); g.lineTo(w, mid); g.stroke();
      return;
    }
    const pk = peaks;
    const px = w / n;
    for (let i = 0; i < n; i++) {
      const mn = pk[i * 2], mx = pk[i * 2 + 1];
      const x = i * px;
      const done = i / n <= progress;
      g.fillStyle = done ? (dim ? "rgba(55,214,184,0.85)" : ember) : line2;
      const y1 = mid - Math.max(1.5, mx * (mid - 4));
      const y2 = mid + Math.max(1.5, -mn * (mid - 4));
      g.fillRect(x, y1, Math.min(barW, px - 0.6), Math.max(2, y2 - y1));
    }
    if (progress > 0) {
      g.fillStyle = dim ? "rgba(55,214,184,0.9)" : ember;
      g.fillRect(progress * w - 1, 2, 2, height - 4);
    }
  }, [peaks, progress, w, height, dim]);
  return (
    <div ref={wrap} className="w-full cursor-pointer select-none" style={{ height }}
      onClick={(e) => { if (!onSeek) return; const r = e.currentTarget.getBoundingClientRect(); onSeek(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))); }}
      role={onSeek ? "slider" : undefined} aria-label="Forme d'onde">
      <canvas ref={ref} style={{ width: "100%", height }} />
    </div>
  );
}

/* Onde en direct (micro) + vumètre */
export function LiveWave({ analyser, active, height = 96, color = "#ff8a3d" }: { analyser: AnalyserNode | null; active: boolean; height?: number; color?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(300);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver((es) => setW(Math.max(60, es[0].contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = w * dpr; cv.height = height * dpr;
    const g = cv.getContext("2d")!;
    let raf = 0;
    const data = analyser ? new Uint8Array(analyser.fftSize) : null;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.getAttribute("data-reduce-motion") === "1";
    const draw = () => {
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, height);
      g.lineWidth = 2;
      g.strokeStyle = color;
      g.shadowColor = color;
      g.shadowBlur = active && !reduced ? 10 : 0;
      g.beginPath();
      const mid = height / 2;
      if (analyser && data && active) {
        analyser.getByteTimeDomainData(data);
        for (let i = 0; i < data.length; i++) {
          const x = (i / (data.length - 1)) * w;
          const y = mid + ((data[i] - 128) / 128) * (mid - 6);
          i === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
        }
      } else {
        g.moveTo(0, mid); g.lineTo(w, mid);
      }
      g.stroke();
      g.shadowBlur = 0;
      if (active && !reduced) raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [analyser, active, w, height, color]);
  return <div ref={wrap} className="w-full" style={{ height }}><canvas ref={ref} style={{ width: "100%", height }} /></div>;
}

export function LevelMeter({ analyser, active }: { analyser: AnalyserNode | null; active: boolean }) {
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    if (!analyser || !active) { if (bar.current) bar.current.style.width = "0%"; return; }
    const data = new Uint8Array(analyser.fftSize);
    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let peak = 0;
      for (let i = 0; i < data.length; i++) { const v = Math.abs(data[i] - 128) / 128; if (v > peak) peak = v; }
      if (bar.current) {
        bar.current.style.width = Math.round(peak * 100) + "%";
        bar.current.style.background = peak > 0.92 ? "var(--svf-err)" : peak > 0.7 ? "var(--svf-warn)" : "var(--svf-teal)";
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [analyser, active]);
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-panel2">
      <div ref={bar} className="h-full rounded-full transition-[width] duration-75" style={{ width: "0%" }} />
    </div>
  );
}

/* ================= FOND AMBIANT ================= */
export function AmbientCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const g = cv.getContext("2d")!;
    let raf = 0, W = 0, H = 0;
    const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.getAttribute("data-reduce-motion") === "1";
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      W = window.innerWidth; H = window.innerHeight;
      cv.width = W * dpr; cv.height = H * dpr;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);
    const sparks = Array.from({ length: 26 }, () => ({ x: Math.random(), y: Math.random(), s: 0.4 + Math.random() * 1.6, v: 0.0004 + Math.random() * 0.0012 }));
    const draw = (t: number) => {
      g.clearRect(0, 0, W, H);
      const layers = [
        { a: 26, f: 0.0045, sp: 0.00022, c: "rgba(255,138,61,0.10)", y: 0.30 },
        { a: 34, f: 0.0032, sp: 0.00016, c: "rgba(55,214,184,0.07)", y: 0.52 },
        { a: 46, f: 0.0021, sp: 0.00011, c: "rgba(255,92,46,0.06)", y: 0.74 },
      ];
      for (const L of layers) {
        g.beginPath();
        for (let x = 0; x <= W; x += 7) {
          const y = H * L.y + Math.sin(x * L.f + t * L.sp) * L.a * Math.sin(x * 0.0011 + t * L.sp * 0.6);
          x === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
        }
        g.strokeStyle = L.c;
        g.lineWidth = 1.6;
        g.stroke();
      }
      for (const s of sparks) {
        s.y -= s.v;
        if (s.y < -0.02) { s.y = 1.02; s.x = Math.random(); }
        const alpha = Math.sin(Math.min(1, Math.max(0, s.y)) * Math.PI) * 0.5;
        g.fillStyle = `rgba(255,179,92,${alpha.toFixed(3)})`;
        g.beginPath();
        g.arc(s.x * W, s.y * H, s.s, 0, Math.PI * 2);
        g.fill();
      }
      if (!reduced()) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={ref} className="pointer-events-none fixed inset-0 -z-10" aria-hidden />;
}

/* ================= SCROLL REVEAL ================= */
export function Reveal({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((es) => {
      es.forEach((e) => { if (e.isIntersecting) { el.classList.add("in"); io.disconnect(); } });
    }, { threshold: 0.12 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} className={`reveal ${className}`} style={{ transitionDelay: delay + "ms" }}>{children}</div>;
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border border-line2 bg-panel2 px-1.5 py-0.5 font-mono text-[10px] text-mut">{children}</kbd>;
}
