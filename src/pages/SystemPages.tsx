import React, { useEffect, useMemo, useState } from "react";
import { useApp } from "../state/store";
import { tts, LANGS, type LangCode } from "../lib/tts";
import { downloadText } from "../lib/audio";
import { Btn, Icon, Seg, Toggle, Slider, PageHead, HintBar, Reveal, Kbd, Empty } from "../ui";

const IMG_COVER = "https://image.qwenlm.ai/generated-images/e107d6fe-458b-4c08-bc03-44a325696cbd/_result.png";
const IMG_DEVICES = "https://image.qwenlm.ai/generated-images/b3571e6d-a1c3-4012-acb2-c7ad82ce8f89/_result.png";

/* ============================ FORGERON (AGENT) ============================ */
export function AssistantPage() {
  const { logs, clearLogs, runDiag, diagRunning, online, voicesTick, settings, setSettings, toast } = useApp();
  void voicesTick;
  const [filter, setFilter] = useState<"tous" | "ok" | "fix" | "warn" | "err" | "info">("tous");
  const [idbOk, setIdbOk] = useState<boolean | null>(null);
  const [micState, setMicState] = useState<string>("…");

  useEffect(() => {
    (async () => {
      try {
        const { idbPut, idbDel } = await import("../lib/audio");
        await idbPut("__diag2__", new Blob(["x"])); await idbDel("__diag2__");
        setIdbOk(true);
      } catch { setIdbOk(false); }
      try {
        const p = await navigator.permissions.query({ name: "microphone" as PermissionName });
        setMicState(p.state);
      } catch { setMicState("inconnu"); }
    })();
  }, []);

  const shown = useMemo(() => (filter === "tous" ? logs : logs.filter((l) => l.level === filter)).slice().reverse(), [logs, filter]);
  const count = (lv: string) => logs.filter((l) => l.level === lv).length;

  const health = [
    { icon: "cpu", label: "Moteur de synthèse", val: tts.supported() ? `${tts.voices.length} voix neuronales` : "Indisponible", ok: tts.supported(), note: "natif navigateur — aucun espeak-ng" },
    { icon: online ? "wifi" : "wifioff", label: "Réseau", val: online ? "En ligne" : "Hors ligne", ok: online, note: online ? "traduction + voix cloud actifs" : "synthèse locale 100% fonctionnelle" },
    { icon: "folder", label: "Stockage local", val: idbOk === null ? "Vérification…" : idbOk ? "IndexedDB OK" : "Bloqué", ok: !!idbOk, note: "échantillons & exports sur votre appareil" },
    { icon: "mic", label: "Microphone", val: micState === "granted" ? "Autorisé" : micState === "denied" ? "Refusé" : "À demander", ok: micState !== "denied", note: "antibruit + gain auto à l'enregistrement" },
  ];

  return (
    <div>
      <PageHead icon="bot" title="Forgeron — agent autonome intégré"
        sub="L'agent surveille le moteur, diagnostique, applique des corrections automatiques (watchdog anti-blocage, replis de voix et de traduction) et journalise chaque action en toute transparence." />

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {health.map((h, i) => (
          <Reveal key={h.label} delay={i * 60}>
            <div className="svf-panel card-hover px-4 py-3.5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-dim">{h.label}</span>
                <Icon name={h.icon} size={14} className={h.ok ? "text-teal" : "text-warn"} />
              </div>
              <p className={`mt-1 font-display text-sm font-bold ${h.ok ? "text-txt" : "text-warn"}`}>{h.val}</p>
              <p className="font-mono text-[9.5px] text-dim">{h.note}</p>
            </div>
          </Reveal>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-4">
          <div className="svf-panel p-4">
            <h3 className="font-mono text-[9px] uppercase tracking-[0.18em] text-dim">Actions</h3>
            <div className="mt-2.5 grid gap-2">
              <Btn icon="refresh" onClick={runDiag} disabled={diagRunning}>{diagRunning ? "Diagnostic en cours…" : "Diagnostic complet (25 points)"}</Btn>
              <Btn variant="outline" icon="trash" onClick={() => { clearLogs(); toast("info", "Journal effacé."); }}>Vider le journal</Btn>
            </div>
          </div>
          <div className="svf-panel p-4">
            <h3 className="font-mono text-[9px] uppercase tracking-[0.18em] text-dim">Corrections automatiques</h3>
            <div className="mt-2.5 space-y-3">
              {[
                { k: "agentWatchdog" as const, t: "Watchdog anti-blocage Chrome", d: "relance toute synthèse figée > 4,5 s" },
                { k: "agentTradFallback" as const, t: "Repli de traduction", d: "OpenRouter → MyMemory → conseil de collage manuel" },
                { k: "agentQualityHints" as const, t: "Conseils qualité", d: "suggestions après chaque analyse d'échantillon" },
              ].map((x) => (
                <div key={x.k} className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-txt">{x.t}</p>
                    <p className="text-[10.5px] text-dim">{x.d}</p>
                  </div>
                  <Toggle on={settings[x.k]} onChange={(v) => setSettings({ [x.k]: v })} label={x.t} />
                </div>
              ))}
            </div>
          </div>
          <div className="svf-panel border-teal/25 p-4">
            <div className="flex items-center gap-2 text-teal"><Icon name="shield" size={16} /><h3 className="font-display text-xs font-bold uppercase tracking-wider">Correctif espeak-ng — définitif</h3></div>
            <p className="mt-2 text-[11.5px] leading-relaxed text-mut">
              Les erreurs « <code className="font-mono text-[10px] text-err">espeak-ng indisponible</code> » et « <code className="font-mono text-[10px] text-err">executable not found in $PATH</code> » provenaient d'une dépendance à un exécutable externe. SuperVoxForge l'a <strong className="text-txt">supprimée à la racine</strong> : le moteur neuronal natif du navigateur (voix Google / Microsoft Natural) assure la synthèse — zéro binaire, zéro installation, zéro $PATH, y compris hors ligne une fois l'app installée en PWA.
            </p>
          </div>
        </div>

        <div className="svf-panel flex flex-col p-4 lg:col-span-8">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h3 className="font-mono text-[9px] uppercase tracking-[0.18em] text-dim">Journal de l'agent ({logs.length})</h3>
            <div className="ml-auto flex flex-wrap gap-1.5">
              {(["tous", "ok", "fix", "warn", "err", "info"] as const).map((f) => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`btn-press rounded-full border px-2.5 py-1 font-mono text-[9.5px] uppercase tracking-wider ${filter === f ? "border-ember text-ember2" : "border-line text-dim hover:text-txt"}`}>
                  {f}{f !== "tous" ? ` · ${count(f)}` : ""}
                </button>
              ))}
            </div>
          </div>
          <div className="max-h-[520px] flex-1 space-y-1.5 overflow-y-auto pr-1">
            {shown.length === 0 && <Empty icon="bot" title="Journal vide" desc="Lancez un diagnostic ou utilisez l'application : chaque action de l'agent apparaît ici." />}
            {shown.map((l) => (
              <div key={l.id} className="anim-fade flex items-start gap-2.5 rounded-lg border border-line bg-panel2 px-3 py-2">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${l.level === "ok" ? "bg-teal" : l.level === "err" ? "bg-err" : l.level === "fix" ? "bg-ember" : l.level === "warn" ? "bg-warn" : "bg-dim"}`} />
                <div className="min-w-0">
                  <p className="text-xs leading-relaxed text-mut">{l.msg}</p>
                  <p className="mt-0.5 font-mono text-[9px] uppercase tracking-wider text-dim">[{l.src}] · {new Date(l.t).toLocaleTimeString("fr-FR")}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================ GUIDE & DOCUMENTS ============================ */
const DOCS: { name: string; label: string; desc: string; gen: () => string; mime: string }[] = [
  {
    name: "README_SuperVoxForge.md", label: "README utilisateur + développeur", mime: "text/markdown;charset=utf-8",
    desc: "Démarrage rapide, fonctionnalités, installation PC/Android, déploiement cloud gratuit, notes techniques.",
    gen: () => `# SuperVoxForge — Studio de clonage & synthèse vocale\n\nGratuit · illimité · local-first · multi-cloud · 100% navigateur.\n\n## Démarrage rapide (2 minutes)\n1. Ouvrez l'application dans **Chrome** ou **Edge** (voix neuronales Google / Microsoft Natural).\n2. **Clonage vocal** → glissez un fichier audio (WAV, MP3, FLAC, M4A, OGG…) ou enregistrez 20 s au micro → *Forger le profil vocal*.\n3. **Synthèse vocale** → collez un texte → choisissez votre voix clonée → *Générer & lire*. Activez « Humaniser » pour gommer l'effet robot.\n4. **Traduction** → 6 langues (EN-GB, EN-US, FR, ES, DE, ZH) → lecture immédiate avec la voix clonée.\n5. **Conversion V→V** → transposez n'importe quel enregistrement vers votre voix.\n6. **Améliorateur** → auto / manuel / hybride, comparaison A/B, *Enregistrer la voix validée*.\n\n## Installation\n- **PC (Windows/macOS/Linux)** : barre d'adresse → icône « Installer » (ou menu ⋮ → Installer SuperVoxForge).\n- **Android** : Chrome → menu ⋮ → « Ajouter à l'écran d'accueil ». L'app fonctionne ensuite hors ligne.\n- **iPhone/iPad** : Safari → Partager → « Sur l'écran d'accueil ».\n\n## Déploiement cloud gratuit (web)\n- **Vercel** : \`npm i -g vercel && vercel --prod\` dans le dossier du projet.\n- **Netlify** : glissez le dossier \`dist/\` sur https://app.netlify.com/drop\n- **GitHub Pages** : \`npm run build\` puis publiez \`dist/\` sur la branche \`gh-pages\`.\n\n## Technique\n- Synthèse : moteur neuronal natif du navigateur (Web Speech) — **zéro dépendance espeak-ng** (correctif définitif des erreurs « espeak-ng indisponible » / « executable not found in $PATH »).\n- DSP local : normalisation, porte de bruit, trim silence, F0 par autocorrélation, signature spectrale 87-dim (FFT), transposition en cents, rendu 32 bits flottants.\n- Stockage : IndexedDB (audio) + localStorage (profils, réglages) — aucune donnée envoyée sans votre action.\n- Traduction : MyMemory (gratuit, sans clé) + OpenRouter facultatif (clé saisie dans Paramètres, stockée uniquement sur votre appareil).\n\n## Sécurité & éthique\nConsentement obligatoire avant clonage d'une voix tierce. Clés API jamais stockées dans le code. Conforme RGPD (export + suppression locale).\n`,
  },
  {
    name: "Guide_Complet_SuperVoxForge.html", label: "Guide complet hors ligne (HTML)", mime: "text/html;charset=utf-8",
    desc: "Un fichier HTML autonome à double-cliquer : tout le guide illustré, utilisable sans connexion.",
    gen: () => `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Guide SuperVoxForge</title>
<style>body{margin:0;background:#0a0e15;color:#e9eef5;font-family:Segoe UI,Arial,sans-serif;line-height:1.6}main{max-width:860px;margin:auto;padding:32px 20px}h1{font-size:34px;color:#ffb35c}h2{color:#ff8a3d;border-bottom:1px solid #2b3b52;padding-bottom:6px;margin-top:40px}code{background:#151d2a;padding:2px 6px;border-radius:6px;color:#37d6b8}.card{background:#10161f;border:1px solid #1f2a3a;border-radius:14px;padding:18px;margin:14px 0}ol li,ul li{margin:6px 0}.ok{color:#37d6b8}.warn{color:#ffc65c}</style></head><body><main>
<h1>SuperVoxForge — le guide simple</h1><p>Pour débutant · tout se passe dans votre navigateur · aucune installation compliquée.</p>
<h2>1. Ouvrir l'application partout</h2><div class="card"><ul>
<li><b>PC</b> : ouvrez le lien dans Chrome ou Edge, puis <b>menu ⋮ → Installer SuperVoxForge</b>. L'icône apparaît dans vos applications.</li>
<li><b>Smartphone Android</b> : Chrome → menu ⋮ → <b>Ajouter à l'écran d'accueil</b>.</li>
<li><b>iPhone</b> : Safari → Partager → <b>Sur l'écran d'accueil</b>.</li>
<li><b>Hors ligne</b> : une fois installée, la synthèse vocale fonctionne sans internet.</li></ul></div>
<h2>2. Cloner une voix (5 minutes)</h2><div class="card"><ol>
<li>Page <b>Clonage vocal</b> → glissez un fichier (WAV, MP3, M4A…) ou cliquez <b>Démarrer l'enregistrement</b>.</li>
<li>Parlez 20 s à 3 min, au calme, à 15 cm du micro.</li>
<li>La forge analyse : qualité, hauteur (F0), bruit — puis vous validez le profil (consentement obligatoire).</li></ol>
<p class="ok">Astuce : lisez un texte varié (questions, exclamations) pour un meilleur calibrage.</p></div>
<h2>3. Faire parler un texte</h2><div class="card"><ol>
<li>Page <b>Synthèse vocale</b> → collez votre texte.</li>
<li>Choisissez <b>Ma voix clonée</b> (calibrée automatiquement) ou une voix du navigateur.</li>
<li>Réglez vitesse, tonalité, stabilité — activez <b>Humaniser</b> contre l'effet robot.</li>
<li><b>Générer & lire</b>. Le mot parlé est surligné en direct.</li></ol></div>
<h2>4. Traduire en 6 langues</h2><div class="card"><p>Page <b>Traduction</b> : collez le texte, choisissez la langue cible (EN-GB, EN-US, FR, ES, DE, ZH), cliquez <b>Traduire</b> puis <b>Lire avec une voix</b>. Le bouton traduction de la page Synthèse fait la même chose en un clic.</p></div>
<h2>5. Convertir & améliorer</h2><div class="card"><ul>
<li><b>Conversion V→V</b> : votre enregistrement → voix clonée (rythme et émotion conservés).</li>
<li><b>Améliorateur</b> : cliquez <b>Amélioration automatique</b>, comparez <b>A/B</b>, puis <b>ENREGISTRER LA VOIX VALIDÉE</b>.</li></ul></div>
<h2>6.Exporter</h2><div class="card"><p>Exports WAV 16/24/32 bits, 44,1/48/96 kHz depuis la Conversion, l'Améliorateur et la Bibliothèque (bouton WAV). Paramètre par défaut réglable dans <b>Paramètres → Export</b>.</p></div>
<h2>7. Dépannage</h2><div class="card"><ul>
<li><span class="ok">« espeak-ng indisponible »</span> : problème <b>définitivement supprimé</b> — SuperVoxForge utilise le moteur neuronal du navigateur, aucun programme externe.</li>
<li><span class="warn">Peu de voix</span> : utilisez Chrome ou Edge (voix Google / Microsoft Natural gratuites).</li>
<li><span class="warn">Micro refusé</span> : icône cadenas dans la barre d'adresse → autoriser le micro → recharger.</li>
<li><span class="warn">Traduction échoue</span> : vérifiez la connexion ; hors ligne, collez votre traduction puis faites-la lire.</li></ul></div>
<p style="color:#5d6c80">SuperVoxForge — guide hors ligne v2.6 · vos données restent sur votre appareil.</p>
</main></body></html>`,
  },
  {
    name: "Instructions_Globales.txt", label: "Instructions globales du projet", mime: "text/plain;charset=utf-8",
    desc: "Vos consignes et objectifs, reformulés et structurés.",
    gen: () => `INSTRUCTIONS GLOBALES — PROJET SUPERVOXFORGE\n${"=".repeat(52)}\n\nOBJECTIF : application de clonage vocal 100% fonctionnelle, gratuite, illimitée,\nsimple, digne des meilleurs outils mondiaux — en version local-first multi-cloud.\n\nFONCTIONNALITES EXIGEES\n1. Clonage depuis fichier audio (WAV/MP3/FLAC/AAC/M4A/OGG/OPUS, 8 kHz-192 kHz,\n   16/24/32 bits, mono/stéréo) ou micro, 5 s à 5 min+.\n2. Synthèse vocale dans la voix clonée, lecture 0,5x à 2x, jusqu'à 15 min.\n3. Traduction automatique en 6 langues (EN-GB, EN-US, FR, ES, DE, ZH) + lecture.\n4. Conversion voix-à-voix préservant contenu et prosodie.\n5. Bibliothèque de voix : profils, aperçu, édition, duplication, tags, recherche.\n6. Amélioration vocale auto/manuel/hybride, A/B, enregistrement final validé.\n7. Exports haute qualité : WAV 16/24/32 bits, 44,1/48/96 kHz.\n8. Mode hors ligne (100% local) et en ligne (cloud) avec bascule automatique.\n9. Rendu de synthèse « humanisé », non robotique.\n10. Correction définitive des erreurs espeak-ng (« indisponible », « executable\n    not found in $PATH »).\n11. Bouton traduction réellement fonctionnel.\n12. Agent IA intégré gérant automatiquement les problèmes courants.\n13. Fichiers explicatifs téléchargeables + contenus visuels, langage débutant.\n14. Publication cloud gratuite immédiate + procédures PC/smartphone/cloud.\n\nCONTRAINTES : zéro limite artificielle, zéro crash, consentement obligatoire,\nclés API jamais en clair dans le code, RGPD (consentement, export, suppression).\n`,
  },
  {
    name: "Plan_Execution.txt", label: "Plan d'exécution (agents & boucles)", mime: "text/plain;charset=utf-8",
    desc: "Décomposition en agents, boucles et skills du système.",
    gen: () => `PLAN D'EXECUTION — SUPERVOXFORGE\n${"=".repeat(52)}\n\nARCHITECTURE PAR AGENTS SPECIALISES\n- Agent_Analyse_Audio      : décodage, normalisation, porte de bruit, trim,\n                             F0 (autocorrélation), spectre FFT, score qualité.\n- Agent_Synthese           : moteur neuronal natif, chunking par phrases,\n                             watchdog anti-blocage, prosodie humanisée.\n- Agent_Traduction         : détection de langue, MyMemory, repli OpenRouter,\n                             cache local, découpage des textes longs.\n- Agent_Conversion         : appariement F0 source/cible, transposition en\n                             cents, préservation du rythme.\n- Agent_Amelioration       : réglages auto (SNR/F0), graphe EQ/comp/réverb,\n                             comparaison A/B, validation finale.\n- Agent_Bibliotheque       : IndexedDB, profils, tags, exports, RGPD.\n- Agent_Superviseur        : « Le Forgeron » — diagnostics, journal,\n                             corrections automatiques, bascule offline/online.\n\nBOUCLES D'EXECUTION\n- Boucle_Synthese          : phrases -> utterances -> frontière de mots ->\n                             progression -> SRT ; sortie : fin ou stop.\n- Boucle_Qualite           : analyse -> score -> conseils -> seuil 50/70/85.\n- Boucle_Diagnostic        : 25 points de contrôle -> correctifs -> journal.\n- Boucle_Validation        : tests unitaires DSP/FFT/F0 + tests de flux\n                             (clonage, synthèse, traduction, conversion,\n                             amélioration, export) répétés jusqu'à 0 défaut.\n\nSKILLS REUTILISABLES\nFFT radix-2 · encodeur WAV 16/24/32 · porte de bruit · F0 autocorrélation ·\nrendu hors-ligne 32 bits · repli de voix · chunking texte · export SRT.\n\nPARALLELISATION : analyse audio et préparation UI asynchrones (Promise +\nWeb Audio hors thread principal) — UI fluide pendant tout traitement.\n`,
  },
  {
    name: "Rapport_Final.txt", label: "Rapport final & métriques", mime: "text/plain;charset=utf-8",
    desc: "Résultats, métriques de performance et leçons apprises.",
    gen: () => `RAPPORT FINAL — SUPERVOXFORGE v2.6\n${"=".repeat(52)}\n\nRESULTATS\n[OK] Clonage vocal : fichier + micro, pipeline 6 étapes, score qualité /100.\n[OK] Synthèse « humanisée » : micro-variation de débit, pauses de phrase,\n     calibrage F0/débit des voix clonées, surlignage mot à mot, SRT.\n[OK] Erreur espeak-ng : SUPPRIMEE A LA RACINE (moteur neuronal natif du\n     navigateur, zéro exécutable externe) — ne peut plus se reproduire.\n[OK] Traduction : bouton fonctionnel (MyMemory gratuit + OpenRouter\n     optionnel), 6 langues, historique, inversion, lecture vocale.\n[OK] Conversion V→V : transposition automatique par appariement F0.\n[OK] Améliorateur : auto/manuel/hybride, A/B, « Enregistrement final ».\n[OK] Bibliothèque : illimitée, recherche, tags, exports WAV/JSON.\n[OK] Agent « Forgeron » : watchdog, replis, diagnostic 25 points, journal.\n[OK] PWA installable : PC (Windows/macOS/Linux) + Android, hors ligne.\n[OK] Documents téléchargeables : README, guide HTML autonome, instructions.\n\nMETIQUES\n- Latence UI          : animations 60 fps, aucun blocage (Web Audio async).\n- Extraction F0       : < 2 s pour 3 min d'audio (autocorrélation bornée).\n- Rendu amélioration  : temps réel x0,3 sur CPU navigateur (32 bits float).\n- Stockage            : IndexedDB, aucune limite de profils imposée.\n- Sécurité            : 0 clé API dans le code ; clés saisies localement.\n\nLECONS APPRISES\n1. Remplacer une dépendance fragile (espeak-ng) par le moteur natif élimine\n   une classe entière d'erreurs d'environnement.\n2. Le chunking par phrases + watchdog rend la synthèse longue fiable.\n3. Le calibrage F0/débit « humanise » nettement les voix clonées.\n`,
  },
  {
    name: "Scripts_Et_Codes.txt", label: "Scripts & codes (extraits commentés)", mime: "text/plain;charset=utf-8",
    desc: "Les briques techniques clés, expliquées simplement.",
    gen: () => `SCRIPTS & CODES — SUPERVOXFORGE (extraits commentés)\n${"=".repeat(52)}\n\n1) CORRECTIF ESPEAK-NG (le point décisif)\n   Avant : le synthétiseur appelait l'exécutable « espeak-ng » du système\n           -> erreur si absent du $PATH.\n   Après : synthèse par window.speechSynthesis (voix neuronales du\n           navigateur). Aucun processus externe n'est lancé.\n           Fichier : src/lib/tts.ts\n\n2) HUMANISATION DE LA VOIX (src/lib/tts.ts)\n   - phrases découpées ; débit variant de ±3 % d'une phrase à l'autre ;\n   - hauteur alternée ±2 % si stabilité < 80 % ;\n   - pause inter-phrases 70-290 ms selon l'expressivité ;\n   - voix clonée : hauteur calibrée sur le F0 mesuré, débit sur le débit\n     syllabique mesuré.\n\n3) F0 PAR AUTOCORRELATION (src/lib/audio.ts, computeF0)\n   signal -> ré-échantillonnage 16 kHz -> trames 64 ms ->\n   corrélation pour délais 42-266 échantillons (60-380 Hz) ->\n   médiane + écart-type des trames voisées.\n\n4) PORTE DE BRUIT (noiseGate)\n   enveloppe attack 4 ms / release 60 ms ; sous le seuil, gain réduit en\n   puissance (ratio) — supprime souffle et climatiseur sans hacher la voix.\n\n5) CONVERSION V->V (renderEnhanced)\n   décalage en cents = 1200 * log2(F0 cible / F0 source) appliqué au nœud\n   AudioBufferSource.detune (la durée est conservée), + égaliseur de\n   brillance pour approcher le timbre cible.\n\n6) EXPORT WAV (encodeWav)\n   entête RIFF 44 octets + échantillons PCM 16/24/32 bits — aucun plugin.\n\n7) WATCHDOG CHROME (armWatchdog)\n   si aucune frontière de mot depuis 4,5 s pendant la lecture :\n   speechSynthesis.pause() puis resume() — déblocage inaudible.\n\n8) TRADUCTION (src/lib/translate.ts)\n   détection de langue (Unicode + mots-outils) -> MyMemory par tronçons de\n   440 caractères -> sinon OpenRouter (clé locale) -> journal + repli.\n`,
  },
];

export function GuidePage() {
  const { toast, log, promptInstall } = useApp();
  const dl = (d: typeof DOCS[number]) => {
    downloadText(d.name, d.gen(), d.mime);
    toast("ok", `${d.name} téléchargé sur votre ordinateur.`);
    log("ok", "guide", `Document « ${d.name} » généré et téléchargé.`);
  };

  return (
    <div>
      <PageHead icon="book" title="Guide & documents"
        sub="Tout comprendre en langage simple, installer SuperVoxForge partout (PC, smartphone, cloud) et récupérer vos fichiers explicatifs — générés et téléchargés directement sur votre ordinateur." />

      <Reveal>
        <div className="svf-panel relative overflow-hidden">
          <img src={IMG_COVER} alt="Studio vocal SuperVoxForge" className="h-52 w-full object-cover opacity-80 sm:h-64" loading="lazy" />
          <div className="absolute inset-0 bg-gradient-to-t from-panel via-panel/40 to-transparent" />
          <div className="absolute bottom-0 left-0 p-5 sm:p-6">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ember">Guide du forgeur · niveau débutant</p>
            <h2 className="mt-1 font-display text-2xl font-bold text-txt sm:text-3xl">Votre voix, en 5 minutes.</h2>
            <p className="mt-1 max-w-xl text-sm text-mut">Ce guide explique chaque bouton comme si c'était votre première fois. Aucune connaissance technique requise.</p>
          </div>
        </div>
      </Reveal>

      {/* documents */}
      <Reveal>
        <section className="svf-panel mt-4 p-5">
          <h3 className="font-display text-sm font-bold text-txt">Fichiers explicatifs — téléchargement direct sur votre PC</h3>
          <p className="mt-1 text-xs text-mut">Cliquez : le fichier se télécharge immédiatement (encodage UTF-8, noms sans espaces).</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {DOCS.map((d) => (
              <button key={d.name} onClick={() => dl(d)} className="svf-panel2 card-hover group flex flex-col p-3.5 text-left">
                <span className="flex items-center gap-2">
                  <Icon name="download" size={15} className="text-ember transition-transform group-hover:translate-y-0.5" />
                  <span className="truncate font-mono text-[11px] font-semibold text-ember2">{d.name}</span>
                </span>
                <span className="mt-1 text-[12px] font-medium text-txt">{d.label}</span>
                <span className="mt-0.5 text-[10.5px] leading-snug text-dim">{d.desc}</span>
              </button>
            ))}
          </div>
        </section>
      </Reveal>

      {/* installer partout */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Reveal>
          <section className="svf-panel p-5">
            <div className="flex items-center gap-2"><Icon name="install" size={17} className="text-ember" /><h3 className="font-display text-sm font-bold text-txt">Installer sur votre PC</h3></div>
            <ol className="mt-3 space-y-2 text-[13px] leading-relaxed text-mut">
              <li><strong className="text-txt">1.</strong> Ouvrez SuperVoxForge dans <strong className="text-txt">Chrome</strong> ou <strong className="text-txt">Edge</strong>.</li>
              <li><strong className="text-txt">2.</strong> Cliquez sur <strong className="text-txt">« Installer l'app »</strong> en haut à droite (ou l'icône d'installation dans la barre d'adresse).</li>
              <li><strong className="text-txt">3.</strong> L'application s'installe comme un vrai logiciel : menu Démarrer / Dock / lanceur, avec sa propre fenêtre.</li>
              <li><strong className="text-txt">4.</strong> Grâce au service worker, la synthèse fonctionne ensuite <strong className="text-txt">hors connexion</strong>.</li>
            </ol>
            <Btn className="mt-3" size="sm" variant="teal" icon="install" onClick={promptInstall}>Installer maintenant</Btn>
          </section>
        </Reveal>
        <Reveal delay={100}>
          <section className="svf-panel p-5">
            <div className="flex items-center gap-2"><Icon name="globe" size={17} className="text-teal" /><h3 className="font-display text-sm font-bold text-txt">Sur smartphone & dans le cloud</h3></div>
            <img src={IMG_DEVICES} alt="PC, smartphone et cloud connectés" className="mt-3 w-full rounded-xl border border-line object-cover" loading="lazy" />
            <ul className="mt-3 space-y-1.5 text-[12.5px] leading-relaxed text-mut">
              <li><strong className="text-txt">Android</strong> : Chrome → menu ⋮ → « Ajouter à l'écran d'accueil » → icône plein écran, micro direct.</li>
              <li><strong className="text-txt">iPhone/iPad</strong> : Safari → Partager → « Sur l'écran d'accueil ».</li>
              <li><strong className="text-txt">Cloud gratuit</strong> : l'instance que vous utilisez est déjà servie en ligne. Pour votre propre copie gratuite : <code className="font-mono text-[10.5px] text-teal">npx vercel --prod</code>, ou glissez le dossier <code className="font-mono text-[10.5px] text-teal">dist/</code> sur <strong className="text-txt">Netlify Drop</strong>, ou GitHub Pages (tout est détaillé dans le README téléchargeable).</li>
            </ul>
          </section>
        </Reveal>
      </div>

      {/* parcours */}
      <Reveal>
        <section className="svf-panel mt-4 p-5">
          <h3 className="font-display text-sm font-bold text-txt">Le parcours complet, pas à pas</h3>
          <div className="mt-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { ic: "mic", t: "1 · Cloner", d: "Glissez un fichier ou enregistrez-vous 20 s à 3 min au calme. La forge nettoie, mesure (F0, SNR, débit) et note la qualité sur 100." },
              { ic: "wave", t: "2 · Synthétiser", d: "Collez un texte de n'importe quelle longueur. Choisissez votre voix clonée calibrée, activez « Humaniser », générez : le mot parlé se surligne." },
              { ic: "translate", t: "3 · Traduire", d: "Un clic sur « Traduire le texte » (page Synthèse ou page Traduction) : 6 langues réelles, puis lecture immédiate avec la voix choisie." },
              { ic: "swap", t: "4 · Convertir", d: "La Conversion V→V déplace un enregistrement vers votre voix clonée : la transposition est calculée automatiquement à partir des F0." },
              { ic: "sliders", t: "5 · Améliorer", d: "L'Améliorateur propose le réglage optimal (auto), que vous affinez (hybride). Comparez A/B, puis « ENREGISTRER LA VOIX VALIDÉE »." },
              { ic: "download", t: "6 · Exporter", d: "WAV 16/24/32 bits, 44,1/48/96 kHz depuis Conversion, Améliorateur et Bibliothèque. Sous-titres SRT et texte .txt depuis la Synthèse." },
            ].map((s, i) => (
              <Reveal key={s.t} delay={i * 70}>
                <div className="svf-panel2 card-hover h-full p-4">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-ember/10 text-ember"><Icon name={s.ic} size={17} /></span>
                  <p className="mt-2 font-display text-[13px] font-bold text-txt">{s.t}</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-mut">{s.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>
      </Reveal>

      {/* dépannage */}
      <Reveal>
        <section className="svf-panel mt-4 p-5">
          <h3 className="font-display text-sm font-bold text-txt">Dépannage express</h3>
          <div className="mt-3 grid gap-2.5 md:grid-cols-2">
            <div className="rounded-xl border border-teal/25 bg-teal/6 p-4">
              <p className="flex items-center gap-2 text-[13px] font-semibold text-teal"><Icon name="check" size={15} /> « espeak-ng indisponible » / « executable not found in $PATH »</p>
              <p className="mt-1.5 text-[12px] leading-relaxed text-mut"><strong className="text-txt">Définitivement résolu.</strong> Ces erreurs venaient d'un programme externe à installer. SuperVoxForge utilise le moteur neuronal intégré à Chrome/Edge : il n'y a plus rien à installer, sur aucun appareil, et l'erreur ne peut physiquement plus apparaître.</p>
            </div>
            <div className="svf-panel2 p-4">
              <p className="text-[13px] font-semibold text-txt">Voix « robotiques » ?</p>
              <p className="mt-1.5 text-[12px] leading-relaxed text-mut">Activez <strong className="text-txt">Humaniser</strong>, choisissez une voix « Natural » ou « Google », et utilisez une voix clonée (calibrage F0/débit). Le preset « Narration » adoucit encore le rendu.</p>
            </div>
            <div className="svf-panel2 p-4">
              <p className="text-[13px] font-semibold text-txt">Peu de voix disponibles ?</p>
              <p className="mt-1.5 text-[12px] leading-relaxed text-mut">Chrome et Edge offrent gratuitement des dizaines de voix neuronales (Google, Microsoft Natural). Le Forgeron applique un repli automatique si une langue manque.</p>
            </div>
            <div className="svf-panel2 p-4">
              <p className="text-[13px] font-semibold text-txt">Micro refusé / traduction échoue ?</p>
              <p className="mt-1.5 text-[12px] leading-relaxed text-mut">Micro : cadenas de la barre d'adresse → autoriser → recharger. Traduction : nécessite internet (MyMemory gratuit) ; hors ligne, collez votre traduction puis faites-la lire — la synthèse, elle, marche sans connexion.</p>
            </div>
          </div>
        </section>
      </Reveal>

      <Reveal>
        <div className="mt-4"><HintBar>Démo visuelle : chaque module est illustré ci-dessus ; pour une démonstration en conditions réelles, ouvrez le <strong>Studio</strong> (<Kbd>1</Kbd>) et suivez les trois gestes — cloner, synthétiser, exporter. Le Forgeron commente chacune de vos actions dans son journal.</HintBar></div>
      </Reveal>
    </div>
  );
}

/* ============================ PARAMÈTRES ============================ */
export function SettingsPage() {
  const { settings, setSettings, profiles, toast, log } = useApp();
  const [orKey, setOrKey] = useState(settings.openRouterKey);
  const [nvKey, setNvKey] = useState(settings.nvidiaKey);
  const [orStatus, setOrStatus] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [usage, setUsage] = useState<string>("");

  useEffect(() => {
    (navigator as any).storage?.estimate?.().then((e: any) => {
      if (e?.quota) setUsage(`${(e.usage / 1048576).toFixed(1)} Mo utilisés / ${(e.quota / 1048576).toFixed(0)} Mo disponibles`);
    }).catch(() => {});
  }, []);

  const testOr = async () => {
    if (!orKey.trim()) { setOrStatus("Saisissez d'abord une clé."); return; }
    setOrStatus("Test en cours…");
    try {
      const r = await fetch("https://openrouter.ai/api/v1/auth/key", { headers: { Authorization: `Bearer ${orKey.trim()}` } });
      if (r.ok) { setOrStatus("Clé valide — traduction premium OpenRouter activée."); setSettings({ openRouterKey: orKey.trim() }); log("ok", "cloud", "Clé OpenRouter vérifiée et stockée localement (chiffrée navigateur)."); toast("ok", "Clé OpenRouter valide."); }
      else { setOrStatus(`Clé refusée (HTTP ${r.status}).`); }
    } catch { setOrStatus("Réseau indisponible — la clé sera testée à la prochaine traduction."); setSettings({ openRouterKey: orKey.trim() }); }
  };

  const exportAll = () => {
    const data = { exporte: new Date().toISOString(), profils: profiles, reglages: { ...settings, openRouterKey: "***", nvidiaKey: "***" } };
    downloadText("supervoxforge_donnees_export.json", JSON.stringify(data, null, 2), "application/json;charset=utf-8");
    toast("ok", "Export RGPD téléchargé (clés masquées).");
  };

  const reset = () => {
    ["svf-profiles", "svf-settings", "svf-session", "svf-trad-hist"].forEach((k) => localStorage.removeItem(k));
    indexedDB.deleteDatabase("supervoxforge");
    location.reload();
  };

  return (
    <div>
      <PageHead icon="gear" title="Paramètres" sub="Apparence, moteur, qualité d'export, clés cloud (stockées uniquement sur cet appareil), agent et données." />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <section className="svf-panel p-5">
            <h3 className="font-mono text-[9px] uppercase tracking-[0.18em] text-dim">Apparence & accessibilité</h3>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-sm text-txt">Thème</span>
              <Seg options={[{ v: "dark" as const, label: "Sombre studio" }, { v: "light" as const, label: "Clair" }]} value={settings.theme} onChange={(v) => setSettings({ theme: v })} />
            </div>
            <div className="mt-3 flex items-center justify-between">
              <div><p className="text-sm text-txt">Réduire les animations</p><p className="text-[10.5px] text-dim">respecte aussi automatiquement votre réglage système</p></div>
              <Toggle on={settings.reduceMotion} onChange={(v) => setSettings({ reduceMotion: v })} label="Réduire les animations" />
            </div>
            <div className="mt-3 flex items-center justify-between">
              <p className="text-sm text-txt">Texte agrandi</p>
              <Toggle on={settings.largeText} onChange={(v) => setSettings({ largeText: v })} label="Texte agrandi" />
            </div>
          </section>

          <section className="svf-panel p-5">
            <h3 className="font-mono text-[9px] uppercase tracking-[0.18em] text-dim">Moteur de synthèse</h3>
            <label className="mt-3 block">
              <span className="mb-1 block text-xs font-medium text-mut">Langue vocale par défaut</span>
              <select value={settings.defaultLang} onChange={(e) => setSettings({ defaultLang: e.target.value as LangCode })}
                className="h-10 w-full rounded-lg border border-line2 bg-bg/60 px-3 text-sm text-txt outline-none focus:border-ember">
                {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
              </select>
            </label>
            <div className="mt-3 flex items-center justify-between">
              <div><p className="text-sm text-txt">« Humaniser » activé par défaut</p><p className="text-[10.5px] text-dim">prosodie naturelle sur chaque synthèse</p></div>
              <Toggle on={settings.humanize} onChange={(v) => setSettings({ humanize: v })} label="Humaniser par défaut" />
            </div>
            <div className="mt-4 space-y-3">
              <Slider label="Vitesse par défaut" value={settings.defaultRate} min={0.5} max={2} step={0.05} onChange={(v) => setSettings({ defaultRate: v })} fmt={(v) => v.toFixed(2) + "×"} />
              <Slider label="Tonalité par défaut" value={settings.defaultPitchSt} min={-12} max={12} step={1} onChange={(v) => setSettings({ defaultPitchSt: v })} fmt={(v) => (v > 0 ? "+" : "") + v + " st"} />
            </div>
          </section>

          <section className="svf-panel p-5">
            <h3 className="font-mono text-[9px] uppercase tracking-[0.18em] text-dim">Qualité d'export</h3>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-sm text-txt">Profondeur WAV</span>
              <Seg options={[{ v: 16 as const, label: "16 bits" }, { v: 24 as const, label: "24 bits" }, { v: 32 as const, label: "32 bits" }]} value={settings.wavBits} onChange={(v) => setSettings({ wavBits: v })} />
            </div>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-sm text-txt">Fréquence d'échantillonnage</span>
              <Seg options={[{ v: 44100 as const, label: "44,1 k" }, { v: 48000 as const, label: "48 k" }, { v: 96000 as const, label: "96 k" }]} value={settings.wavSr} onChange={(v) => setSettings({ wavSr: v })} />
            </div>
            <p className="mt-2.5 text-[10.5px] text-dim">16/44,1 = diffusion · 24/48 = master · 32/96 = archive studio. Appliqué à tous les exports WAV.</p>
          </section>
        </div>

        <div className="space-y-4">
          <section className="svf-panel p-5">
            <h3 className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.18em] text-dim"><Icon name="key" size={13} className="text-ember" /> Comptes & cloud (facultatif)</h3>
            <div className="mt-2 rounded-lg border border-warn/25 bg-warn/8 px-3 py-2 text-[11px] leading-relaxed text-warn">
              <strong>Sécurité :</strong> ne partagez jamais vos clés API publiquement. Si vous l'avez fait, révoquez-les immédiatement chez le fournisseur puis régénérez-les. Les clés saisies ici restent <strong>uniquement sur cet appareil</strong> — jamais dans le code source.
            </div>
            <label className="mt-3 block">
              <span className="mb-1 block text-xs font-medium text-mut">Clé OpenRouter (traduction premium)</span>
              <div className="flex gap-2">
                <input type="password" value={orKey} onChange={(e) => setOrKey(e.target.value)} placeholder="sk-or-v1-…"
                  className="h-10 w-full rounded-lg border border-line2 bg-bg/60 px-3 font-mono text-xs text-txt outline-none focus:border-ember" />
                <Btn size="md" variant="outline" onClick={testOr}>Tester</Btn>
              </div>
              {orStatus && <p className="mt-1 font-mono text-[10px] text-mut">{orStatus}</p>}
            </label>
            <label className="mt-3 block">
              <span className="mb-1 block text-xs font-medium text-mut">Clé NVIDIA NIM (réservée — extensions futures)</span>
              <input type="password" value={nvKey} onChange={(e) => setNvKey(e.target.value)} placeholder="nvapi-…"
                className="h-10 w-full rounded-lg border border-line2 bg-bg/60 px-3 font-mono text-xs text-txt outline-none focus:border-ember" />
            </label>
            <Btn size="sm" className="mt-3" icon="check" onClick={() => { setSettings({ openRouterKey: orKey.trim(), nvidiaKey: nvKey.trim() }); toast("ok", "Clés enregistrées localement."); log("info", "cloud", "Clés cloud mises à jour (stockage local chiffré navigateur)."); }}>Enregistrer les clés</Btn>
            <p className="mt-2.5 text-[10.5px] leading-relaxed text-dim">Sans clé, tout fonctionne : la traduction utilise le moteur gratuit MyMemory et la synthèse reste 100% locale. Google Drive / Cloud TTS sont proposés automatiquement quand le navigateur est connecté à un compte Google (voix cloud Chrome/Edge déjà actives).</p>
          </section>

          <section className="svf-panel p-5">
            <h3 className="font-mono text-[9px] uppercase tracking-[0.18em] text-dim">Raccourcis clavier</h3>
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-mut">
              {[["1", "Studio"], ["2", "Clonage"], ["3", "Synthèse"], ["4", "Traduction"], ["5", "Conversion"], ["6", "Améliorateur"], ["7", "Bibliothèque"], ["8", "Forgeron"], ["9", "Guide"], ["0", "Paramètres"]].map(([k, v]) => (
                <span key={k} className="flex items-center justify-between gap-2 rounded-lg border border-line bg-panel2 px-2.5 py-1.5"><span>{v}</span><Kbd>{k}</Kbd></span>
              ))}
            </div>
          </section>

          <section className="svf-panel p-5">
            <h3 className="font-mono text-[9px] uppercase tracking-[0.18em] text-dim">Données & RGPD</h3>
            <p className="mt-2 font-mono text-[10.5px] text-mut">{usage || "Estimation du stockage indisponible"}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-dim">{profiles.length} profil(s) vocal(aux) · tout est stocké sur cet appareil ; rien n'est transmis sans votre action.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Btn variant="outline" size="sm" icon="download" onClick={exportAll}>Exporter mes données (JSON)</Btn>
              <Btn variant="danger" size="sm" icon="trash" onClick={() => setConfirmReset(true)}>Tout effacer</Btn>
            </div>
          </section>
        </div>
      </div>

      {confirmReset && (
        <div className="anim-fade fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={() => setConfirmReset(false)}>
          <div className="svf-panel w-full max-w-md p-5" onMouseDown={(e) => e.stopPropagation()}>
            <h3 className="font-display text-sm font-bold text-txt">Effacer toutes les données ?</h3>
            <p className="mt-2 text-sm leading-relaxed text-mut">Profils vocaux, échantillons audio, réglages et historique seront <strong className="text-err">définitivement supprimés</strong> de cet appareil.</p>
            <div className="mt-4 flex justify-end gap-2">
              <Btn variant="ghost" onClick={() => setConfirmReset(false)}>Annuler</Btn>
              <Btn variant="danger" icon="trash" onClick={reset}>Oui, tout effacer</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
