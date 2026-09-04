/* ============================================================
   SuperVoxForge — traduction multilingue réelle
   Moteur principal : MyMemory (gratuit, sans clé, CORS ouvert).
   Moteur premium facultatif : OpenRouter (clé saisie localement
   dans Paramètres — jamais stockée dans le code source).
   ============================================================ */
import type { LangCode } from "./tts";

const LANG_NAME: Record<LangCode, string> = {
  "fr-FR": "French", "en-GB": "British English", "en-US": "American English",
  "es-ES": "Spanish", "de-DE": "German", "zh-CN": "Mandarin Chinese",
};

export function detectLang(text: string): LangCode {
  const t = text.trim();
  if (/[\u4e00-\u9fff]/.test(t)) return "zh-CN";
  if (/[\u00e4\u00f6\u00fc\u00df]/i.test(t) || /\b(der|die|das|und|ich|nicht|ist|mit)\b/i.test(t)) return "de-DE";
  if (/\b(el|la|los|las|que|de|en|un|una|por|para|con|no|es|está|muy)\b/i.test(t) && /[¿¡áéíóúñ]/i.test(t)) return "es-ES";
  if (/\b(le|la|les|des|est|et|un|une|que|vous|nous|dans|pour|avec|sur|ce|qui|ne|pas)\b/i.test(t) && /[àâçéèêëîïôùû]/i.test(t)) return "fr-FR";
  if (/\b(the|and|of|to|in|is|you|that|it|for|was|with)\b/i.test(t)) return /\b(colour|favour|realise|organised)\b/i.test(t) ? "en-GB" : "en-US";
  if (/\b(que|de|não|uma|para|com)\b/i.test(t)) return "es-ES";
  return "fr-FR";
}

function chunkText(text: string, max = 440): string[] {
  const parts: string[] = [];
  let rest = text.trim();
  while (rest.length > max) {
    let cut = rest.lastIndexOf(". ", max);
    if (cut < max * 0.4) cut = rest.lastIndexOf(" ", max);
    if (cut < max * 0.3) cut = max;
    parts.push(rest.slice(0, cut + 1).trim());
    rest = rest.slice(cut + 1).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

function decodeEntities(s: string): string {
  const el = document.createElement("textarea");
  el.innerHTML = s;
  return el.value;
}

async function myMemoryChunk(chunk: string, src: LangCode, tgt: LangCode): Promise<string> {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(chunk)}&langpair=${encodeURIComponent(src + "|" + tgt)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`MyMemory HTTP ${res.status}`);
  const j = await res.json();
  const out = j?.responseData?.translatedText;
  if (!out || /MYMEMORY WARNING/i.test(out)) throw new Error("MyMemory : quota ou requête refusée");
  return decodeEntities(out);
}

async function openRouter(text: string, src: LangCode, tgt: LangCode, key: string): Promise<string> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "openai/gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a professional translator. Translate exactly, preserving meaning, tone and structure. Output ONLY the translation, nothing else." },
        { role: "user", content: `Translate the following text from ${LANG_NAME[src]} to ${LANG_NAME[tgt]}:\n\n${text}` },
      ],
      max_tokens: 2000,
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter HTTP ${res.status}`);
  const j = await res.json();
  const out = j?.choices?.[0]?.message?.content?.trim();
  if (!out) throw new Error("OpenRouter : réponse vide");
  return out;
}

export interface TranslateResult { text: string; engine: string; }

export async function translateText(
  text: string,
  src: LangCode,
  tgt: LangCode,
  openRouterKey?: string
): Promise<TranslateResult> {
  const clean = text.trim();
  if (!clean) throw new Error("Aucun texte à traduire.");
  if (src === tgt) return { text: clean, engine: "aucune (langues identiques)" };

  if (openRouterKey) {
    try {
      return { text: await openRouter(clean, src, tgt, openRouterKey), engine: "OpenRouter · GPT-4o-mini" };
    } catch (e) {
      console.warn("OpenRouter indisponible, repli MyMemory", e);
    }
  }
  const chunks = chunkText(clean);
  const outs: string[] = [];
  for (const c of chunks) outs.push(await myMemoryChunk(c, src, tgt));
  return { text: outs.join(" "), engine: "MyMemory (gratuit, local-compatible)" };
}
