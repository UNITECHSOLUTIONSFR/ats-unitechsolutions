"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Responsable } from "@/lib/missions/responsables";
import ChoixResponsable from "./responsable";
import { IconeRecherche } from "../icones";

export interface CarteMission {
  id: string; intitule: string; client: string | null; localisation: string | null; creeLe: string; debut: string | null;
  responsableId: string | null; suivis: number; appeles: number; envoyes: number; retenus: number;
}

const sansAccents = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const date = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });

/** Liste des missions en cartes, avec recherche instantanée et bascule « Mes missions / Toutes ». */
export default function ListeMissions({ missions, titre, responsables, estAdmin, lienVue, miennes, pertinents }: {
  missions: CarteMission[]; titre: string; responsables: Responsable[]; estAdmin: boolean; lienVue: { miennes: string; toutes: string }; miennes: boolean;
  /** Nombre de profils pertinents par mission (calculé côté serveur, affiché dès qu'il est prêt). */
  pertinents?: Record<string, React.ReactNode>;
}) {
  const [texte, setTexte] = useState("");
  const nomDe = useMemo(() => new Map(responsables.map((r) => [r.id, r.nom])), [responsables]);
  const visibles = useMemo(() => {
    const t = sansAccents(texte.trim());
    return t ? missions.filter((m) => sansAccents(`${m.intitule} ${m.client ?? ""} ${m.localisation ?? ""} ${nomDe.get(m.responsableId ?? "") ?? ""}`).includes(t)) : missions;
  }, [missions, texte, nomDe]);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-nuit">{titre} <span className="font-semibold text-slate-400">({visibles.length})</span></h2>
        <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
          <label className="relative min-w-0 flex-1 sm:flex-none">
            <IconeRecherche className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={texte} onChange={(e) => setTexte(e.target.value)} placeholder="Intitulé, client, lieu, responsable" className="champ w-full pl-9 sm:w-72" />
          </label>
          <div className="flex rounded-full bg-slate-100/90 p-1 text-sm font-semibold">
            <Link href={lienVue.miennes} className={`rounded-full px-3.5 py-1 transition ${miennes ? "bg-white text-nuit shadow-sm" : "text-slate-500 hover:text-nuit"}`}>Mes missions</Link>
            <Link href={lienVue.toutes} className={`rounded-full px-3.5 py-1 transition ${!miennes ? "bg-white text-nuit shadow-sm" : "text-slate-500 hover:text-nuit"}`}>Toutes</Link>
          </div>
        </div>
      </div>

      {visibles.map((m) => (
        <article key={m.id} className="carte group p-5 transition hover:shadow-[0_20px_40px_-25px_rgba(11,26,63,0.45)] hover:ring-1 hover:ring-marque-200">
          <div className="flex items-start gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element -- logo statique */}
            <img src="/logo-unitech-symbole.png" alt="" className="h-12 w-12 shrink-0 rounded-2xl bg-white object-contain p-1.5 ring-1 ring-slate-200" />
            <div className="min-w-0 flex-1">
              <Link href={`/missions/${m.id}`} className="block text-[17px] font-bold leading-snug tracking-tight text-nuit hover:text-marque-700">{m.intitule}</Link>
              <div className="text-slate-500">{m.client ?? "Client non précisé"}</div>
            </div>
            <ChoixResponsable missionId={m.id} responsableId={m.responsableId} responsables={responsables} estAdmin={estAdmin} compact />
          </div>

          {m.localisation && <div className="mt-3"><span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">📍 {m.localisation}</span></div>}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
              <span>Créée le {date(m.creeLe)}</span>
              {m.debut && <span className="rounded-md bg-marque-50 px-2 py-0.5 font-semibold text-marque-700">Démarrage le {date(m.debut)}</span>}
            </div>
            <div className="flex flex-wrap items-center gap-5">
              {pertinents?.[m.id]}
              <Compteur n={m.suivis} libelle="Proposé" />
              <Compteur n={m.appeles} libelle="Appelé" />
              <Compteur n={m.envoyes} libelle="Envoyé au client" />
              <Compteur n={m.retenus} libelle="Retenu" accent />
              <Link href={`/missions/${m.id}`} className="bouton-secondaire px-4 py-2">Voir la mission</Link>
            </div>
          </div>
        </article>
      ))}
      {!visibles.length && (
        <div className="carte p-8 text-center text-sm text-slate-500">
          {texte ? "Aucune mission ne correspond à la recherche." : miennes ? <>Aucune mission pour vous ici. <Link href={lienVue.toutes} className="lien">Voir toutes les missions</Link></> : "Aucune mission."}
        </div>
      )}
    </section>
  );
}

function Compteur({ n, libelle, accent }: { n: number; libelle: string; accent?: boolean }) {
  return (
    <span className="text-sm text-slate-500">
      <span className={`mr-1 text-base font-bold tabular-nums ${accent && n > 0 ? "text-emerald-600" : "text-nuit"}`}>{n}</span>
      {libelle}{n > 1 && !libelle.includes(" ") ? "s" : ""}
    </span>
  );
}
