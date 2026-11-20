import "server-only";
import { unstable_cache } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { trelloConfigure, trelloGet, type ListeTrello } from "@/lib/trello/client";
import { TABLEAU_TRELLO } from "@/lib/trello/regles";

/**
 * Vue Kanban des missions (19/11/2026) : les mêmes colonnes que le tableau Trello, dans le même ordre (de gauche à droite),
 * et dans chaque colonne les missions de l'ATS dont la carte s'y trouve. Trello fait foi : une carte déplacée dans Trello
 * change de colonne ici à la lecture suivante ; une carte glissée ici est déplacée dans Trello (20/11/2026, kanban-actions.ts).
 */
export interface CarteKanban {
  id: string; intitule: string; client: string | null; recruteur: string | null; url: string | null; statut: string;
  pertinents: number; suivis: number; appeles: number; envoyes: number; retenus: number;
}
export interface ColonneKanban { nom: string; idListe: string | null; cartes: CarteKanban[] }

/** Colonnes ouvertes du tableau Trello, dans l'ordre (gardées 10 minutes). */
export const colonnesTrello = unstable_cache(async (): Promise<{ id: string; nom: string }[]> => {
  if (!trelloConfigure()) return [];
  const listes = await trelloGet<(ListeTrello & { pos: number })[]>(`/boards/${TABLEAU_TRELLO}/lists?filter=open&fields=name,pos`);
  return [...listes].sort((a, b) => a.pos - b.pos).map((l) => ({ id: l.id, nom: l.name }));
}, ["kanban-colonnes-trello-v2"], { revalidate: 600 });

const cle = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export async function kanbanMissions(supabase: SupabaseClient): Promise<{ colonnes: ColonneKanban[]; trelloLu: boolean }> {
  const [noms, { data: missions }, { data: classements }] = await Promise.all([
    colonnesTrello().catch(() => [] as { id: string; nom: string }[]),
    supabase.from("missions").select("id, intitule, client, statut, trello_colonne, trello_recruteur, trello_url, created_at, propositions(statut)")
      .not("trello_carte_id", "is", null).order("created_at", { ascending: false }),
    supabase.from("classements_mission").select("mission_id, pertinents"),
  ]);
  const pertinents = new Map((classements ?? []).map((c) => [c.mission_id as string, Number(c.pertinents ?? 0)]));
  const cartes = (missions ?? []).map((m) => {
    const p = (m.propositions ?? []) as { statut: string }[];
    const n = (s: string) => p.filter((x) => x.statut === s).length;
    return {
      colonne: (m.trello_colonne as string | null) ?? "",
      carte: { id: m.id as string, intitule: m.intitule as string, client: m.client as string | null, recruteur: m.trello_recruteur as string | null, url: m.trello_url as string | null,
        statut: m.statut as string, pertinents: pertinents.get(m.id as string) ?? 0, suivis: p.length, appeles: n("appele"), envoyes: n("envoye_client"), retenus: n("retenu") },
    };
  });
  // Colonnes de Trello dans son ordre ; si Trello ne répond pas, celles connues des missions (ordre d'apparition).
  const ordre = noms.length ? noms : [...new Set(cartes.map((c) => c.colonne).filter(Boolean))].map((nom) => ({ id: null as string | null, nom }));
  const parCle = new Map<string, ColonneKanban>(ordre.map(({ id, nom }) => [cle(nom), { nom, idListe: id, cartes: [] }]));
  const hors: ColonneKanban = { nom: "Colonne Trello fermée ou inconnue", idListe: null, cartes: [] };
  for (const c of cartes) (parCle.get(cle(c.colonne)) ?? hors).cartes.push(c.carte);
  const colonnes = [...parCle.values()];
  if (hors.cartes.length) colonnes.push(hors);
  return { colonnes, trelloLu: noms.length > 0 };
}
