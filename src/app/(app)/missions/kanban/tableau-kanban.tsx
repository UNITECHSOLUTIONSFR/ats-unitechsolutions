"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import type { ColonneKanban } from "@/lib/missions/kanban";
import { deplacerMissionKanban } from "@/lib/missions/kanban-actions";

type Annulation = { missionId: string; intitule: string; versListe: string; versNom: string; depuisNom: string };

/**
 * Colonnes du Kanban avec glisser-déposer (20/11/2026) : la carte change de colonne tout de suite à l'écran, le serveur la
 * déplace dans Trello ; si Trello refuse, elle revient à sa place avec le message. Un bouton « Annuler » reste 10 secondes.
 */
export function TableauKanban({ colonnes: initiales, deplacable }: { colonnes: ColonneKanban[]; deplacable: boolean }) {
  const [colonnes, setColonnes] = useState(initiales);
  const [survol, setSurvol] = useState<string | null>(null);
  const [message, setMessage] = useState<{ texte: string; erreur?: boolean; annulation?: Annulation } | null>(null);
  const [enCours, demarrer] = useTransition();
  const glisse = useRef<{ missionId: string; depuis: string } | null>(null);
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Nouvelles données du serveur (page rafraîchie) : elles remplacent l'affichage.
  const [source, setSource] = useState(initiales);
  if (source !== initiales) { setSource(initiales); setColonnes(initiales); }
  useEffect(() => () => { if (minuteur.current) clearTimeout(minuteur.current); }, []);

  const afficher = (m: typeof message) => {
    setMessage(m);
    if (minuteur.current) clearTimeout(minuteur.current);
    minuteur.current = setTimeout(() => setMessage(null), m?.erreur ? 12_000 : 10_000);
  };

  /** Déplace la carte à l'écran (en haut de la colonne cible) ; renvoie l'état d'avant pour pouvoir revenir. */
  const deplacerALEcran = (missionId: string, versNom: string) => {
    const avant = colonnes;
    const carte = colonnes.flatMap((c) => c.cartes).find((c) => c.id === missionId);
    if (!carte) return avant;
    setColonnes(colonnes.map((c) => ({
      ...c,
      cartes: c.nom === versNom ? [carte, ...c.cartes.filter((x) => x.id !== missionId)] : c.cartes.filter((x) => x.id !== missionId),
    })));
    return avant;
  };

  const deplacer = (missionId: string, depuisNom: string, vers: ColonneKanban, annulation = false) => {
    if (!vers.idListe || vers.nom === depuisNom) return;
    const depuis = colonnes.find((c) => c.nom === depuisNom);
    const intitule = colonnes.flatMap((c) => c.cartes).find((c) => c.id === missionId)?.intitule ?? "Mission";
    const avant = deplacerALEcran(missionId, vers.nom);
    setMessage(null);
    demarrer(async () => {
      const r = await deplacerMissionKanban(missionId, vers.idListe as string).catch(() => ({ ok: false as const, erreur: "Le serveur ne répond pas : réessayez." }));
      if (!r.ok) { setColonnes(avant); afficher({ texte: r.erreur, erreur: true }); return; }
      afficher({
        texte: annulation ? `« ${intitule} » remise dans « ${vers.nom} » (Trello aussi).` : `« ${intitule} » déplacée vers « ${vers.nom} » dans Trello.`,
        annulation: !annulation && depuis?.idListe ? { missionId, intitule, versListe: depuis.idListe, versNom: depuis.nom, depuisNom: vers.nom } : undefined,
      });
    });
  };

  return (
    <>
      {message && (
        <div role="status" className={`fixed bottom-5 left-1/2 z-50 flex max-w-[92vw] -translate-x-1/2 items-center gap-3 rounded-xl px-4 py-3 text-sm shadow-lg ring-1 ${message.erreur ? "bg-red-50 text-red-800 ring-red-200" : "bg-nuit text-white ring-slate-700"}`}>
          <span>{message.texte}</span>
          {message.annulation && (
            <button type="button" className="rounded-lg bg-white/15 px-3 py-1 font-semibold hover:bg-white/25" disabled={enCours}
              onClick={() => {
                const a = message.annulation!;
                const cible = colonnes.find((c) => c.nom === a.versNom);
                if (cible) deplacer(a.missionId, a.depuisNom, cible, true);
              }}>
              Annuler
            </button>
          )}
        </div>
      )}
      <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6">
        <div className="flex min-w-max gap-4">
          {colonnes.map((col) => {
            const cible = deplacable && !!col.idListe;
            return (
              <section key={col.nom}
                className={`flex w-72 shrink-0 flex-col rounded-2xl bg-slate-100/80 p-3 ring-1 transition ${survol === col.nom ? "ring-2 ring-marque-400 bg-marque-50/60" : "ring-slate-200/70"}`}
                onDragOver={cible ? (e) => { if (!glisse.current) return; e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (survol !== col.nom) setSurvol(col.nom); } : undefined}
                onDragLeave={cible ? (e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setSurvol(null); } : undefined}
                onDrop={cible ? (e) => {
                  e.preventDefault(); setSurvol(null);
                  const g = glisse.current; glisse.current = null;
                  if (g) deplacer(g.missionId, g.depuis, col);
                } : undefined}>
                <h2 className="mb-2 flex items-center justify-between gap-2 px-1 text-sm font-bold text-nuit">
                  <span className="truncate" title={col.nom}>{col.nom}</span>
                  <span className="pastille">{col.cartes.length}</span>
                </h2>
                <div className="min-h-12 space-y-2">
                  {col.cartes.map((m) => (
                    <Link key={m.id} href={`/missions/${m.id}`} draggable={deplacable}
                      onDragStart={deplacable ? (e) => { glisse.current = { missionId: m.id, depuis: col.nom }; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", m.id); } : undefined}
                      onDragEnd={() => { glisse.current = null; setSurvol(null); }}
                      className={`block rounded-xl bg-white p-3 text-sm shadow-sm ring-1 ring-slate-200 transition hover:ring-marque-300 ${deplacable ? "cursor-grab active:cursor-grabbing" : ""}`}>
                      <div className="font-semibold leading-snug text-nuit">{m.intitule}</div>
                      {m.client && <div className="mt-0.5 text-xs text-slate-500">{m.client}</div>}
                      <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                        {m.recruteur && <span className="pastille">{m.recruteur}</span>}
                        <span className={`pastille ${m.pertinents > 0 ? "pastille-vert" : ""}`}>{m.pertinents} pertinent(s)</span>
                        {m.suivis > 0 && <span className="pastille">{m.suivis} suivi(s)</span>}
                        {m.appeles > 0 && <span className="pastille">{m.appeles} appelé(s)</span>}
                        {m.envoyes > 0 && <span className="pastille pastille-orange">{m.envoyes} envoyé(s)</span>}
                        {m.retenus > 0 && <span className="pastille pastille-vert">{m.retenus} retenu(s)</span>}
                      </div>
                    </Link>
                  ))}
                  {!col.cartes.length && <p className="px-1 py-2 text-xs text-slate-400">Aucune mission</p>}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </>
  );
}
