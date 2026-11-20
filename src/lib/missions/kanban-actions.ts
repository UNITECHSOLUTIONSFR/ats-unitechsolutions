"use server";

import { revalidatePath, updateTag } from "next/cache";
import { exigerUtilisateur } from "@/lib/acces";
import { clientSupabaseAdmin } from "@/lib/supabase/admin";
import { deplacerCarteTrello } from "@/lib/trello/client";
import { champsApresDeplacement } from "@/lib/trello/regles";
import { normaliserNomPersonne } from "@/lib/metier/texte";
import { colonnesTrello } from "./kanban";

export type ResultatDeplacement = { ok: true; colonne: string } | { ok: false; erreur: string };

/**
 * Vue Kanban (20/11/2026) : une carte glissée vers une autre colonne est déplacée dans Trello, puis la mission suit
 * (colonne, statut, recruteur : mêmes règles que la lecture horaire). Trello d'abord : si Trello refuse, rien ne change ici.
 * Chaque déplacement est noté dans le journal (qui, quelle mission, de quelle colonne vers laquelle).
 */
export async function deplacerMissionKanban(missionId: string, idListe: string): Promise<ResultatDeplacement> {
  const { utilisateur, supabase } = await exigerUtilisateur();
  const { data: m } = await supabase.from("missions").select("id, intitule, trello_carte_id, trello_colonne").eq("id", missionId).maybeSingle();
  if (!m?.trello_carte_id) return { ok: false, erreur: "Cette mission n'est pas reliée à une carte Trello." };
  const colonne = (await colonnesTrello().catch(() => [])).find((c) => c.id === idListe);
  if (!colonne) return { ok: false, erreur: "Colonne Trello introuvable : actualisez la page." };
  if (colonne.nom === m.trello_colonne) return { ok: true, colonne: colonne.nom };

  const r = await deplacerCarteTrello(m.trello_carte_id as string, idListe);
  if (!r.ok) return r;

  const champs = champsApresDeplacement(colonne.nom);
  const admin = clientSupabaseAdmin();
  let responsable: string | null | undefined;
  if (champs.trello_recruteur) {
    const { data: personnes } = await admin.from("utilisateurs").select("id, nom_affiche, email").eq("actif", true);
    const cible = normaliserNomPersonne("", champs.trello_recruteur.replace(/^M\.\s*/, ""));
    responsable = (personnes ?? []).find((p) => normaliserNomPersonne("", `${p.nom_affiche ?? ""} ${p.email ?? ""}`).includes(cible))?.id ?? null;
  }
  const { error } = await supabase.from("missions").update({
    ...champs, trello_lu_le: new Date().toISOString(), ...(responsable !== undefined ? { responsable_id: responsable } : {}),
  }).eq("id", missionId);
  // La carte est déjà déplacée dans Trello : la lecture horaire corrigera la mission si l'écriture ici a échoué.
  if (error) console.error("Kanban : mission non mise à jour :", error.message);
  await admin.from("journal_acces").insert({
    utilisateur_id: utilisateur.id, action: "modification",
    details: { kanban_trello: { mission_id: missionId, mission: m.intitule, de: m.trello_colonne, vers: colonne.nom } },
  });
  updateTag("accueil");
  revalidatePath("/missions");
  revalidatePath("/missions/kanban");
  revalidatePath(`/missions/${missionId}`);
  return { ok: true, colonne: colonne.nom };
}
