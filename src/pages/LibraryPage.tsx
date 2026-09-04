import React, { useMemo, useState } from "react";
import { useApp, type Profile } from "../state/store";
import { idbGet, decodeBlob, monoData, peaksOf, encodeWav, resampleBuffer, downloadBlob, downloadText, fmtDur, colorOf } from "../lib/audio";
import { LANGS } from "../lib/tts";
import { Btn, Icon, Seg, Waveform, usePlayer, Empty, Modal, PageHead } from "../ui";

type Filter = "toutes" | "fichier" | "micro" | "améliorée" | "convertie";

export default function LibraryPage() {
  const { profiles, updateProfile, removeProfile, duplicateProfile, settings, toast, nav, log } = useApp();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("toutes");
  const [editId, setEditId] = useState<string | null>(null);
  const [delId, setDelId] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [peaks, setPeaks] = useState<Float32Array | null>(null);
  const player = usePlayer();

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return profiles.filter((p) => {
      if (filter !== "toutes" && p.source !== filter) return false;
      if (!needle) return true;
      return p.name.toLowerCase().includes(needle) || p.tags.some((t) => t.toLowerCase().includes(needle));
    });
  }, [profiles, q, filter]);

  const play = async (p: Profile) => {
    if (playingId === p.id && player.state === "playing") { player.stop(); setPlayingId(null); return; }
    try {
      const blob = await idbGet(p.sampleKey);
      if (!blob) throw new Error("x");
      const buf = await decodeBlob(blob);
      setPeaks(peaksOf(monoData(buf), 200));
      player.load(buf); player.play();
      setPlayingId(p.id);
    } catch { toast("err", "Échantillon introuvable dans le stockage local."); }
  };

  const exportAudio = async (p: Profile) => {
    try {
      const blob = await idbGet(p.sampleKey);
      if (!blob) throw new Error("x");
      const buf = await decodeBlob(blob);
      const rs = await resampleBuffer(buf, settings.wavSr);
      downloadBlob(`${p.name.replace(/[^\w\-à-ÿ ]/gi, "").trim() || "voix"}.wav`, encodeWav(rs, settings.wavBits));
      toast("ok", `Export WAV de « ${p.name} » téléchargé.`);
    } catch { toast("err", "Export impossible : échantillon introuvable."); }
  };

  const exportJson = (p: Profile) => {
    downloadText(`profil_${p.name.replace(/\s+/g, "_")}.json`, JSON.stringify(p, null, 2), "application/json;charset=utf-8");
    toast("ok", "Profil exporté (.json).");
  };

  const useInSynth = (p: Profile) => {
    localStorage.setItem("svf-synth-clone", p.id);
    nav("synth");
    toast("info", `« ${p.name} » sélectionnée pour la synthèse — calibrage F0/débit actif.`);
    log("info", "bibliothèque", `Profil « ${p.name} » envoyé vers la synthèse vocale.`);
  };

  const editing = profiles.find((p) => p.id === editId) ?? null;
  const deleting = profiles.find((p) => p.id === delId) ?? null;

  return (
    <div>
      <PageHead icon="library" title="Bibliothèque de voix"
        sub={`${profiles.length} profil(s) · stockage local illimité, aucun plafond. Cliquez sur une carte pour pré-écouter 2–3 s d'échantillon.`} />

      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <div className="relative">
          <Icon name="search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-dim" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un nom, un tag…"
            className="h-9 w-56 rounded-lg border border-line2 bg-panel pl-8 pr-3 text-xs text-txt outline-none focus:border-ember" />
        </div>
        <Seg options={[
          { v: "toutes" as Filter, label: "Toutes" }, { v: "fichier" as Filter, label: "Fichiers" },
          { v: "micro" as Filter, label: "Micro" }, { v: "améliorée" as Filter, label: "Améliorées" }, { v: "convertie" as Filter, label: "Converties" },
        ]} value={filter} onChange={setFilter} />
        <Btn size="sm" variant="outline" icon="plus" className="ml-auto" onClick={() => nav("clone")}>Nouvelle voix</Btn>
      </div>

      {list.length === 0 ? (
        <Empty icon={profiles.length ? "search" : "mic"} title={profiles.length ? "Aucun résultat" : "Bibliothèque vide"}
          desc={profiles.length ? "Essayez un autre mot-clé ou un autre filtre." : "Forgez votre première voix : importez un fichier ou enregistrez-vous au micro, la forge s'occupe du reste."}
          action={!profiles.length ? <Btn icon="mic" onClick={() => nav("clone")}>Cloner une voix</Btn> : undefined} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((p) => (
            <div key={p.id} className={`svf-panel card-hover group relative flex flex-col p-4 ${playingId === p.id ? "border-ember/50" : ""}`}>
              <div className="flex items-start gap-3">
                <button onClick={() => play(p)} aria-label={`Écouter ${p.name}`}
                  className="btn-press relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl font-display text-sm font-bold text-[#14100a] transition-transform hover:scale-105"
                  style={{ background: colorOf(p.id) }}>
                  {playingId === p.id && player.state === "playing" ? <Icon name="stop" size={17} className="text-[#14100a]" /> : p.name.slice(0, 2).toUpperCase()}
                  {playingId === p.id && player.state === "playing" && <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-panel bg-ember pulse-dot" />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-txt">{p.name}</p>
                  <p className="font-mono text-[9.5px] text-dim">
                    {LANGS.find((l) => l.code === p.lang)?.short} · {fmtDur(p.duration)} · {p.f0 ? Math.round(p.f0) + " Hz" : "F0 n/d"} · {p.source}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <span className={`rounded px-1.5 py-0.5 font-mono text-[8.5px] uppercase tracking-wider ${p.grade === "Excellent" ? "bg-teal/12 text-teal" : p.grade === "Bon" ? "bg-ember/12 text-ember2" : "bg-warn/12 text-warn"}`}>{p.grade} · {p.quality}/100</span>
                    {p.tags.slice(0, 3).map((t) => <span key={t} className="rounded bg-panel2 px-1.5 py-0.5 font-mono text-[8.5px] text-mut">#{t}</span>)}
                  </div>
                </div>
                <div className="flex flex-col gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button className="btn-press rounded-md p-1.5 text-dim hover:bg-panel2 hover:text-txt" title="Renommer / tags" onClick={() => setEditId(p.id)}><Icon name="edit" size={13} /></button>
                  <button className="btn-press rounded-md p-1.5 text-dim hover:bg-panel2 hover:text-txt" title="Dupliquer" onClick={() => duplicateProfile(p.id)}><Icon name="copy" size={13} /></button>
                  <button className="btn-press rounded-md p-1.5 text-dim hover:bg-err/10 hover:text-err" title="Supprimer" onClick={() => setDelId(p.id)}><Icon name="trash" size={13} /></button>
                </div>
              </div>
              {playingId === p.id && (
                <div className="anim-fade mt-3">
                  <Waveform peaks={peaks} height={54} dim progress={player.duration ? player.position / player.duration : 0} onSeek={(f) => player.seek(f)} />
                </div>
              )}
              <div className="mt-3 flex items-center gap-1.5 border-t border-line pt-3">
                <Btn size="sm" variant="outline" icon="wave" onClick={() => useInSynth(p)}>Synthétiser</Btn>
                <Btn size="sm" variant="ghost" icon="download" onClick={() => exportAudio(p)}>WAV</Btn>
                <Btn size="sm" variant="ghost" icon="file" onClick={() => exportJson(p)}>JSON</Btn>
                <span className="ml-auto font-mono text-[9px] text-dim">{new Date(p.createdAt).toLocaleDateString("fr-FR")}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <EditModal p={editing} onClose={() => setEditId(null)} onSave={(name, tags) => { updateProfile(editing.id, { name, tags }); setEditId(null); toast("ok", "Profil mis à jour."); }} />
      )}
      {deleting && (
        <Modal title="Supprimer définitivement ?" onClose={() => setDelId(null)}>
          <p className="text-sm leading-relaxed text-mut">
            « <strong className="text-txt">{deleting.name}</strong> » et son échantillon audio local seront effacés (conforme RGPD). Cette action est irréversible.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Btn variant="ghost" onClick={() => setDelId(null)}>Annuler</Btn>
            <Btn variant="danger" icon="trash" onClick={async () => { await removeProfile(deleting.id); setDelId(null); toast("ok", "Profil supprimé."); }}>Supprimer</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

function EditModal({ p, onClose, onSave }: { p: Profile; onClose: () => void; onSave: (name: string, tags: string[]) => void }) {
  const [name, setName] = useState(p.name);
  const [tags, setTags] = useState(p.tags.join(", "));
  return (
    <Modal title="Modifier le profil" onClose={onClose}>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-mut">Nom</span>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40}
          className="h-10 w-full rounded-lg border border-line2 bg-bg/60 px-3 text-sm text-txt outline-none focus:border-ember" />
      </label>
      <label className="mt-3 block">
        <span className="mb-1 block text-xs font-medium text-mut">Tags (virgules)</span>
        <input value={tags} onChange={(e) => setTags(e.target.value)} maxLength={80}
          className="h-10 w-full rounded-lg border border-line2 bg-bg/60 px-3 text-sm text-txt outline-none focus:border-ember" />
      </label>
      <div className="mt-4 flex justify-end gap-2">
        <Btn variant="ghost" onClick={onClose}>Annuler</Btn>
        <Btn icon="check" onClick={() => onSave(name.trim() || p.name, tags.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 8))}>Enregistrer</Btn>
      </div>
    </Modal>
  );
}
