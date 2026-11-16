"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Responsable } from "@/lib/missions/responsables";
import ChoixResponsable from "./responsable";
import { EtiquetteTrello } from "./trello";
import { IconeRecherche } from "../icones";

export interface CarteMission {
  id: string; intitule: string; client: string | null; localisation: string | null; creeLe: string; debut: string | null;
  responsableId: string | null; suivis: number; appeles: number; envoyes: number; retenus: number;
  /** Mission lue depuis Trello : colonne, recruteur et lien vers la carte. */
  trello?: { colonne: string | null; recruteur: string | null; url: string | null } | null;
  /** TJM de la carte : information interne, jamais utilisée pour classer. */
  tjm?: string | null;
  /** Compétences demandées, les plus importantes d'abord. */
  competences: string[];
}

const sansAccents = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const date = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });

/** Liste des missions en cartes, avec recherche instantanée et bascule « Mes missions / Toutes ». */
export default function ListeMissions({ missions, titre, responsables, estAdmin, lienVue, miennes, pertinents, resumes }: {
  missions: CarteMission[]; titre: string; responsables: Responsable[]; estAdmin: boolean; lienVue: { miennes: string; toutes: string }; miennes: boolean;
  /** Nombre de profils pertinents par mission (calculé côté serveur, affiché dès qu'il est prêt). */
  pertinents?: Record<string, React.ReactNode>;
  /** Jauge du meilleur score et trigrammes des 3 premiers profils (calculés côté serveur). */
  resumes?: Record<string, React.ReactNode>;
}) {
  const [texte, setTexte] = useState("");
  const nomDe = useMemo(() => new Map(responsables.map((r) => [r.id, r.nom])), [responsables]);
  const visibles = useMemo(() => {
    const t = sansAccents(texte.trim());
    return t ? missions.filter((m) => sansAccents(`${m.intitule} ${m.client ?? ""} ${m.localisation ?? ""} ${nomDe.get(m.responsableId ?? "") ?? ""} ${m.trello?.recruteur ?? ""} ${m.trello?.colonne ?? ""}`).includes(t)) : missions;
  }, [missions, texte, nomDe]);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-nuit">{titre} <span className="font-semibold text-slate-400">({visibles.length})</span></h2>
        <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
          <label className="relative min-w-0 flex-1 sm:flex-none">
            <IconeRecherche className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={texte} onChange={(e) => setTexte(e.target.value)} placeholder="Intitulé, client, lieu, recruteur" className="champ w-full pl-9 sm:w-72" />
          </label>
          <div className="flex rounded-full bg-slate-100/90 p-1 text-sm font-semibold">
            <Link href={lienVue.miennes} className={`rounded-full px-3.5 py-1 transition ${miennes ? "bg-white text-nuit shadow-sm" : "text-slate-500 hover:text-nuit"}`}>Mes missions</Link>
            <Link href={lienVue.toutes} className={`rounded-full px-3.5 py-1 transition ${!miennes ? "bg-white text-nuit shadow-sm" : "text-slate-500 hover:text-nuit"}`}>Toutes</Link>
          </div>
        </div>
      </div>

      {/* Grille « décision » : poste, client, compétences demandées, meilleur score et profils pertinents. */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {visibles.map((m) => (
          <article key={m.id} className="carte carte-cliquable group relative flex flex-col gap-3 p-5 transition hover:shadow-[0_18px_36px_-22px_rgba(11,26,63,0.45)] hover:ring-1 hover:ring-marque-200">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="mb-1.5 flex flex-wrap items-center gap-2">
                  {m.trello ? <EtiquetteTrello colonne={m.trello.colonne} recruteur={m.trello.recruteur} url={null} compacte /> : null}
                  <span className="text-xs text-slate-400">{m.trello ? "reçue le" : "créée le"} {date(m.creeLe)}</span>
                </div>
                {/* Le lien couvre toute la carte (clic n'importe où) ; les autres liens restent cliquables au-dessus. */}
                <Link href={`/missions/${m.id}`} className="block text-[17px] font-bold leading-snug tracking-tight text-marque-600 after:absolute after:inset-0 after:rounded-[inherit] hover:text-marque-500">{m.intitule}</Link>
                <div className="mt-0.5 line-clamp-1 text-sm text-slate-500" title={m.localisation ?? undefined}>{[m.client ?? "Client non précisé", lieuCourt(m.localisation)].filter(Boolean).join(" · ")}</div>
              </div>
              {resumes?.[m.id] && <div className="relative shrink-0">{resumes[m.id]}</div>}
            </div>
            {m.competences.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {m.competences.slice(0, 3).map((k) => <span key={k} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">{k}</span>)}
                {m.competences.length > 3 && <span className="px-1 py-1 text-xs text-slate-400">+{m.competences.length - 3}</span>}
              </div>
            )}
            <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-sm text-slate-500">
              <div className="relative">{pertinents?.[m.id]}</div>
              <span className="flex items-center gap-2">
                {m.tjm && <span className="relative rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800 ring-1 ring-amber-200" title="Information interne : jamais utilisée pour classer, jamais envoyée">💶 {montantTJM(m.tjm)}</span>}
                <span>{m.suivis} suivi{m.suivis > 1 ? "s" : ""}</span>
              </span>
            </div>
            {!m.trello && <div className="relative -mt-1 flex justify-end"><ChoixResponsable missionId={m.id} responsableId={m.responsableId} responsables={responsables} estAdmin={estAdmin} compact /></div>}
          </article>
        ))}
      </div>
      {!visibles.length && (
        <div className="carte p-8 text-center text-sm text-slate-500">
          {texte ? "Aucune mission ne correspond à la recherche." : miennes ? <>Aucune mission pour vous ici. <Link href={lienVue.toutes} className="lien">Voir toutes les missions</Link></> : "Aucune mission."}
        </div>
      )}
    </section>
  );
}

/** « 16 rue du Général…, 75015 Paris » → « Paris » ; « Saint-Denis (17 rue…) » → « Saint-Denis » : la ville, sans l'adresse. */
export function lieuCourt(lieu: string | null): string | null {
  if (!lieu) return null;
  const sansParentheses = lieu.replace(/\(.*?\)/g, "").trim();
  const cp = /\b\d{5}\s+([A-Za-zÀ-ÿ' -]+?)(?:\s+cedex)?\s*$/i.exec(sansParentheses);
  if (cp) return cp[1].trim();
  const premier = sansParentheses.split(/[,·]/)[0].trim();
  return /\d/.test(premier) ? sansParentheses.split(/[,·]/).pop()!.trim() : premier;
}

/** Montant du TJM, sans le libellé (« Prix d'achat maximum : 425 € HT » → « 425 € HT »). */
export function montantTJM(tjm: string): string {
  const apres = tjm.includes(":") ? tjm.slice(tjm.indexOf(":") + 1) : tjm;
  return apres.replace(/^\s*(tjm|taux journalier)\s*/i, "").trim().slice(0, 40);
}
