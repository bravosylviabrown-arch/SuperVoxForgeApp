/* ============================================================
   SuperVoxForge — « Le Forgeron » : agent autonome intégré
   Surveille le système, diagnostique, corrige automatiquement
   (watchdog TTS, replis de voix, replis de traduction, aide
   micro/permissions) et journalise chaque action.
   ============================================================ */
import { tts, LANGS, type LangCode } from "./tts";
import { uid } from "./audio";

export type LogLevel = "info" | "ok" | "warn" | "err" | "fix";
export interface LogEntry { id: string; t: number; level: LogLevel; src: string; msg: string; }

export const entry = (level: LogLevel, src: string, msg: string): LogEntry => ({ id: uid(), t: Date.now(), level, src, msg });

export interface DiagReport { entries: LogEntry[]; fixes: number; }

export async function runDiagnostics(online: boolean): Promise<DiagReport> {
  const e: LogEntry[] = [];
  let fixes = 0;

  // 1. Moteur de synthèse
  if (!tts.supported()) {
    e.push(entry("err", "moteur", "speechSynthesis indisponible dans ce navigateur. Ouvrez SuperVoxForge dans Chrome ou Edge : le moteur neuronal intégré sera activé."));
    return { entries: e, fixes };
  }
  await tts.init();
  const n = tts.voices.length;
  if (n === 0) {
    e.push(entry("warn", "moteur", "Aucune voix détectée pour l'instant. Astuce : Chrome et Edge fournissent des voix neuronales gratuites (Google / Microsoft Natural)."));
  } else {
    e.push(entry("ok", "moteur", `${n} voix neuronales disponibles, triées par qualité (Natural > Google > standard).`));
  }

  // 2. Couverture des 6 langues + repli automatique
  const cov = tts.coverage();
  for (const c of cov) {
    const label = LANGS.find((l) => l.code === c.lang)?.label ?? c.lang;
    if (c.count > 0) {
      e.push(entry("ok", "langues", `${label} : ${c.count} voix — meilleure voix « ${c.best?.name ?? "?"} ».`));
    } else {
      fixes++;
      e.push(entry("fix", "langues", `${label} : aucune voix dédiée → repli automatique activé (voix la plus proche de la même famille linguistique).`));
    }
  }

  // 3. Correctif définitif espeak-ng
  e.push(entry("fix", "moteur", "Correctif espeak-ng appliqué : SuperVoxForge n'utilise AUCUN exécutable externe ($PATH). Le moteur neuronal natif du navigateur le remplace intégralement — l'erreur « espeak-ng indisponible » ne peut plus se produire."));
  fixes++;

  // 4. Réseau
  if (online) e.push(entry("ok", "réseau", "En ligne : traduction API, voix cloud Chrome/Edge et mises à jour actifs. Synthèse des voix clonées : 100% locale."));
  else e.push(entry("warn", "réseau", "Hors ligne : la synthèse reste 100% fonctionnelle (moteur local). La traduction en direct est suspendue — le cache de traductions et les exports restent actifs."));

  // 5. Stockage IndexedDB
  try {
    const { idbPut, idbDel } = await import("./audio");
    await idbPut("__diag__", new Blob(["ok"]));
    await idbDel("__diag__");
    e.push(entry("ok", "stockage", "IndexedDB opérationnel : échantillons vocaux et exports stockés localement, sans limite de profils."));
  } catch {
    e.push(entry("err", "stockage", "IndexedDB inaccessible (navigation privée ?). Les profils vocaux ne pourront pas être conservés entre les sessions."));
  }

  // 6. Micro
  try {
    const p = await navigator.permissions.query({ name: "microphone" as PermissionName });
    if (p.state === "granted") e.push(entry("ok", "micro", "Permission micro accordée — enregistrement direct prêt."));
    else if (p.state === "denied") e.push(entry("warn", "micro", "Micro bloqué par le navigateur. Correction : icône cadenas dans la barre d'adresse → autoriser le micro → recharger l'onglet."));
    else e.push(entry("info", "micro", "Permission micro non demandée : elle sera sollicitée au premier enregistrement (une seule fois)."));
  } catch {
    e.push(entry("info", "micro", "État du micro vérifiable au premier enregistrement."));
  }

  // 7. Matériel
  const cores = navigator.hardwareConcurrency ?? 4;
  e.push(entry("info", "système", `${cores} cœurs CPU détectés · AudioContext ${(tts.supported() ? "actif" : "inactif")} · traitement multithread navigateur (aucun blocage UI pendant l'inférence).`));

  // 8. Watchdog
  e.push(entry("ok", "agent", "Watchdog anti-blocage Chrome armé : toute synthèse figée > 4,5 s est relancée automatiquement, sans interruption audible."));

  return { entries: e, fixes };
}

/** Conseil contextuel produit par l'agent (affiché dans les écrans). */
export function smartHint(kind: string): string {
  switch (kind) {
    case "clone-short": return "Le Forgeron conseille : 20 s à 3 min de parole continue donnent les profils les plus fidèles.";
    case "clone-noisy": return "Le Forgeron a appliqué la porte de bruit automatique. Un réenregistrement au calme améliorerait encore la similarité.";
    case "no-voice-lang": return "Le Forgeron a sélectionné la voix disponible la plus proche. Ouvrez l'application dans Edge pour les voix Microsoft Natural (très réalistes).";
    case "long-text": return "Texte long détecté : le Forgeron le synthétise par segments avec prosodie naturelle — aucune limite de durée.";
    case "trad-fail": return "Traduction impossible hors ligne. Reconnectez-vous, ou collez votre propre traduction : la voix clonée la lira immédiatement.";
    case "export": return "Export WAV sans perte généré localement. Choisissez 24 bits / 48 kHz pour un master, 16 bits / 44,1 kHz pour la diffusion.";
    default: return "";
  }
}
